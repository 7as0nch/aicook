// AI 聊天 store：当前会话 + 流式消息状态机
// 配合 services/sse.ts -> chatStream() 使用。
// 注意：mobx 数组替换比 push 更稳定，触发 wxml 重新渲染。
import { observable, action } from 'mobx-miniprogram';
import { chatStream, ChatSendRequest, SSEEvent, SSETask } from '../services/sse';
import { aiApi } from '../services/ai.api';
import { nextClientId } from '../utils/id';
import type { AISession, Int64Like } from '../types/api';
import type { ChatMessage, ChatSegment } from '../types/chat';

export const chatStore = observable({
  session: null as AISession | null,
  messages: [] as ChatMessage[],
  streaming: false as boolean,
  reasoningEnabled: false as boolean,
  webSearchEnabled: false as boolean,
  // 持有当前流任务，便于停止生成
  _currentTask: null as SSETask | null,

  reset: action(function (this: typeof chatStore) {
    this.session = null;
    this.messages = [];
    this.streaming = false;
    this._currentTask = null;
  }),

  setSession: action(function (this: typeof chatStore, session: AISession | null) {
    this.session = session;
  }),

  // 加载历史消息（进入会话页时调用）
  loadHistory: action(async function (this: typeof chatStore, session_id: Int64Like, limit = 50) {
    const reply = await aiApi.listMessages(session_id, limit);
    this.session = reply.session;
    this.messages = (reply.messages || []).map(toClientMessage);
  }),

  // 发送一条消息（流式）
  send: action(function (this: typeof chatStore, text: string, opts?: Partial<ChatSendRequest>) {
    if (this.streaming) {
      console.warn('[chatStore] still streaming, ignore');
      return;
    }
    const userMsg: ChatMessage = {
      client_id: nextClientId(),
      session_id: this.session?.id,
      role: 'user',
      segments: [{ kind: 'text', content: text }],
      status: 'done',
      created_at_ms: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      client_id: nextClientId(),
      session_id: this.session?.id,
      role: 'assistant',
      segments: [],
      status: 'streaming',
      created_at_ms: Date.now(),
    };
    this.messages = [...this.messages, userMsg, assistantMsg];
    this.streaming = true;

    const task = chatStream(
      {
        session_id: this.session?.id ? String(this.session.id) : undefined,
        text,
        scene: this.session?.scene,
        reasoning_enabled: this.reasoningEnabled,
        web_search_enabled: this.webSearchEnabled,
        ...opts,
      },
      {
        onEvent: (ev) => onSSEEvent(this, assistantMsg.client_id, ev),
        onDone: () => {
          markDone(this, assistantMsg.client_id);
        },
        onError: (err) => {
          appendError(this, assistantMsg.client_id, err.message);
        },
      },
    );
    this._currentTask = task;
  }),

  abort: action(function (this: typeof chatStore) {
    if (this._currentTask) {
      this._currentTask.abort();
      this._currentTask = null;
    }
    // 把当前 streaming 消息标为 done
    const idx = this.messages.findIndex((m) => m.status === 'streaming');
    if (idx >= 0) {
      this.messages[idx] = { ...this.messages[idx], status: 'done' };
      this.messages = [...this.messages];
    }
    this.streaming = false;
  }),

  toggleReasoning: action(function (this: typeof chatStore) {
    this.reasoningEnabled = !this.reasoningEnabled;
  }),

  toggleWebSearch: action(function (this: typeof chatStore) {
    this.webSearchEnabled = !this.webSearchEnabled;
  }),
});

// ---- 内部辅助 ----

function toClientMessage(m: import('../types/api').AIMessage): ChatMessage {
  const seg: ChatSegment = { kind: 'text', content: m.content || '' };
  return {
    client_id: nextClientId(),
    server_id: m.id,
    session_id: m.ai_session_id,
    role: (m.role as ChatMessage['role']) || 'assistant',
    segments: m.content ? [seg] : [],
    status: 'done',
    created_at_ms: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
  };
}

function findMsg(store: typeof chatStore, client_id: string): { idx: number; msg: ChatMessage | null } {
  const idx = store.messages.findIndex((m) => m.client_id === client_id);
  return { idx, msg: idx >= 0 ? store.messages[idx] : null };
}

function patchMsg(store: typeof chatStore, client_id: string, patch: (msg: ChatMessage) => ChatMessage): void {
  const { idx, msg } = findMsg(store, client_id);
  if (idx < 0 || !msg) return;
  store.messages[idx] = patch(msg);
  store.messages = [...store.messages];
}

function onSSEEvent(store: typeof chatStore, client_id: string, ev: SSEEvent): void {
  switch (ev.event) {
    case 'answer_delta': {
      const data = ev.data as { text?: string };
      patchMsg(store, client_id, (msg) => appendText(msg, data?.text || ''));
      break;
    }
    case 'reasoning_delta': {
      const data = ev.data as { text?: string };
      patchMsg(store, client_id, (msg) => appendReasoning(msg, data?.text || ''));
      break;
    }
    case 'tool_call': {
      const data = ev.data as { tool_name?: string; arguments?: string; result?: string };
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [...msg.segments, {
          kind: 'tool_call' as const,
          tool_name: data?.tool_name || '',
          arguments: data?.arguments,
          result: data?.result,
        }],
      }));
      break;
    }
    case 'recipe_card': {
      const data = ev.data as { recipe_id?: Int64Like; title?: string; summary?: string; cover_image_url?: string };
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [...msg.segments, {
          kind: 'recipe_card' as const,
          recipe_id: data?.recipe_id,
          title: data?.title || '',
          summary: data?.summary,
          cover_image_url: data?.cover_image_url,
        }],
      }));
      break;
    }
    case 'status_delta': {
      const data = ev.data as { message?: string };
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [...msg.segments, { kind: 'status' as const, message: data?.message || '' }],
      }));
      break;
    }
    case 'done': {
      markDone(store, client_id);
      break;
    }
    case 'error': {
      const data = ev.data as { message?: string };
      appendError(store, client_id, data?.message || '出错了');
      break;
    }
    default:
      console.debug('[chatStore] ignored event', ev.event, ev.data);
  }
}

function appendText(msg: ChatMessage, text: string): ChatMessage {
  if (!text) return msg;
  const segs = msg.segments.slice();
  const last = segs[segs.length - 1];
  if (last && last.kind === 'text') {
    segs[segs.length - 1] = { kind: 'text', content: last.content + text };
  } else {
    segs.push({ kind: 'text', content: text });
  }
  return { ...msg, segments: segs };
}

function appendReasoning(msg: ChatMessage, text: string): ChatMessage {
  if (!text) return msg;
  const segs = msg.segments.slice();
  const last = segs[segs.length - 1];
  if (last && last.kind === 'reasoning') {
    segs[segs.length - 1] = { kind: 'reasoning', content: last.content + text };
  } else {
    segs.push({ kind: 'reasoning', content: text });
  }
  return { ...msg, segments: segs };
}

function markDone(store: typeof chatStore, client_id: string): void {
  patchMsg(store, client_id, (msg) => ({ ...msg, status: 'done' }));
  store.streaming = false;
  store._currentTask = null;
}

function appendError(store: typeof chatStore, client_id: string, message: string): void {
  patchMsg(store, client_id, (msg) => ({
    ...msg,
    status: 'error',
    segments: [...msg.segments, { kind: 'error' as const, message }],
  }));
  store.streaming = false;
  store._currentTask = null;
}
