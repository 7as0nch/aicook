// AI 聊天 store：当前会话 + 流式消息状态机
// 配合 services/sse.ts -> chatStream() 使用。
// 注意：mobx 数组替换比 push 更稳定，触发 wxml 重新渲染。
import { observable, action } from 'mobx-miniprogram';
import { chatStream, ChatSendRequest, SSEEvent, SSETask } from '../services/sse';
import { aiApi } from '../services/ai.api';
import { nextClientId } from '../utils/id';
import type { AISession, Int64Like, Source } from '../types/api';
import type { ChatMessage, ChatSegment } from '../types/chat';

export interface SendOptions {
  scene?: string;
  recipe_id?: number;
  quote_context?: Record<string, unknown>;
  attachments?: unknown[];
  context?: Record<string, unknown>;
  title?: string;
}

export const chatStore = observable({
  session: null as AISession | null,
  messages: [] as ChatMessage[],
  streaming: false as boolean,
  reasoningEnabled: false as boolean,
  webSearchEnabled: false as boolean,
  imageRecipeEnabled: false as boolean,
  // 持有当前流任务，便于停止生成
  _currentTask: null as SSETask | null,

  // ===== V10: sheet 全局状态（取代 ai-sheet 内部 data） =====
  // 所有页面共享同一份状态，关闭时全局同步，杜绝跨页面残留收起动画
  sheetVisible: false as boolean,
  sheetExpanded: false as boolean,
  sheetScene: '' as string,
  sheetRecipeId: undefined as string | undefined,
  sheetQuoteContext: null as Record<string, unknown> | null,

  openSheet: action(function (this: typeof chatStore, payload?: { scene?: string; recipe_id?: string | number; quote_context?: Record<string, unknown> }) {
    this.sheetVisible = true;
    this.sheetExpanded = this.messages.length > 0;
    this.sheetScene = payload?.scene || '';
    this.sheetRecipeId = payload?.recipe_id !== undefined ? String(payload.recipe_id) : undefined;
    this.sheetQuoteContext = payload?.quote_context || null;
  }),

  closeSheet: action(function (this: typeof chatStore) {
    this.sheetVisible = false;
    this.sheetExpanded = false;
  }),

  toggleSheetExpanded: action(function (this: typeof chatStore) {
    this.sheetExpanded = !this.sheetExpanded;
  }),

  setSheetExpanded: action(function (this: typeof chatStore, expanded: boolean) {
    this.sheetExpanded = expanded;
  }),

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
  send: action(function (this: typeof chatStore, text: string, opts?: SendOptions) {
    if (this.streaming) {
      console.warn('[chatStore] still streaming, ignore');
      return;
    }
    const trimmed = (text || '').trim();
    if (!trimmed && !opts?.attachments?.length) {
      return;
    }
    const userMsg: ChatMessage = {
      client_id: nextClientId(),
      session_id: this.session?.id,
      role: 'user',
      segments: trimmed ? [{ kind: 'text', content: trimmed }] : [],
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

    const body: ChatSendRequest = {
      session_id: this.session?.id ? String(this.session.id) : undefined,
      text: trimmed,
      scene: opts?.scene || this.session?.scene,
      recipe_id: opts?.recipe_id,
      title: opts?.title,
      context: opts?.context,
      attachments: opts?.attachments,
      quote_context: opts?.quote_context,
      reasoning_enabled: this.reasoningEnabled,
      web_search_enabled: this.webSearchEnabled,
      image_recipe_enabled: this.imageRecipeEnabled,
    };

    const task = chatStream(body, {
      onEvent: (ev) => onSSEEvent(this, assistantMsg.client_id, ev),
      onDone: () => {
        markDone(this, assistantMsg.client_id);
      },
      onError: (err) => {
        appendError(this, assistantMsg.client_id, err.message);
      },
    });
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

  toggleImageRecipe: action(function (this: typeof chatStore) {
    this.imageRecipeEnabled = !this.imageRecipeEnabled;
  }),

  toggleReasoningCollapsed: action(function (this: typeof chatStore, client_id: string) {
    const idx = this.messages.findIndex((m) => m.client_id === client_id);
    if (idx < 0) return;
    const msg = this.messages[idx];
    this.messages[idx] = { ...msg, reasoning_collapsed: !msg.reasoning_collapsed };
    this.messages = [...this.messages];
  }),
});

// ---- 内部辅助 ----

function toClientMessage(m: import('../types/api').AIMessage): ChatMessage {
  const segs: ChatSegment[] = [];
  if (m.content) {
    segs.push({ kind: 'text', content: m.content });
  }
  if (m.response_sources && m.response_sources.length > 0) {
    segs.push({
      kind: 'sources',
      sources: m.response_sources.map((s) => ({
        title: s.title || '',
        snippet: s.snippet,
      })),
    });
  }
  return {
    client_id: nextClientId(),
    server_id: m.id,
    session_id: m.ai_session_id,
    role: (m.role as ChatMessage['role']) || 'assistant',
    segments: segs,
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
  // 后端字段：content / seq / part_type / call_id / message_id / run_id + metadata
  const data = (ev.data || {}) as Record<string, unknown>;
  switch (ev.event) {
    case 'start': {
      // 首次发送时后端回写 session_id，要存回 store 以便后续追加消息
      const sid = data.session_id as string | undefined;
      const scene = data.scene as string | undefined;
      const title = data.title as string | undefined;
      if (sid && !store.session) {
        store.session = { id: sid, scene, title } as AISession;
      } else if (sid && store.session && !store.session.id) {
        store.session = { ...store.session, id: sid };
      }
      break;
    }
    case 'answer_delta': {
      patchMsg(store, client_id, (msg) => appendText(msg, String(data.content || '')));
      break;
    }
    case 'reasoning_delta': {
      patchMsg(store, client_id, (msg) => appendReasoning(msg, String(data.content || '')));
      break;
    }
    case 'agent_delta': {
      const text = String(data.content || '');
      if (!text) break;
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [...msg.segments, { kind: 'agent', content: text }],
      }));
      break;
    }
    case 'status_delta': {
      const text = String(data.content || '');
      if (!text) break;
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [...msg.segments, { kind: 'status', message: text }],
      }));
      break;
    }
    case 'tool_call': {
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [
          ...msg.segments,
          {
            kind: 'tool_call',
            tool_name: String(data.tool_name || data.name || ''),
            arguments: data.arguments ? String(data.arguments) : undefined,
            result: data.result ? String(data.result) : undefined,
          },
        ],
      }));
      break;
    }
    case 'recipe_card': {
      const meta = data as {
        recipe_id?: Int64Like;
        title?: string;
        summary?: string;
        cover_image_url?: string;
        draft?: Record<string, unknown>;
      };
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [
          ...msg.segments,
          {
            kind: 'recipe_card',
            recipe_id: meta.recipe_id,
            title: meta.title || '生成的菜谱',
            summary: meta.summary,
            cover_image_url: meta.cover_image_url,
            draft: meta.draft,
          },
        ],
      }));
      break;
    }
    case 'approval': {
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [
          ...msg.segments,
          {
            kind: 'approval',
            call_id: data.call_id ? String(data.call_id) : undefined,
            prompt: String(data.prompt || data.content || '需要确认'),
            options: (data.options as Array<{ label: string; value: string }>) || undefined,
          },
        ],
      }));
      break;
    }
    case 'done': {
      // 写入完整回复来源 + server_id
      const sources = (data.reply_sources as Source[] | undefined) || [];
      const assistantId = data.assistant_message_id as string | undefined;
      const sessionId = data.session_id as string | undefined;
      patchMsg(store, client_id, (msg) => {
        const next: ChatMessage = { ...msg, status: 'done' };
        if (assistantId) next.server_id = assistantId;
        if (sessionId) next.session_id = sessionId;
        if (sources.length > 0) {
          next.segments = [
            ...msg.segments,
            {
              kind: 'sources',
              sources: sources.map((s) => ({
                title: s.title || '',
                snippet: s.snippet,
              })),
            },
          ];
        }
        return next;
      });
      // 同步 session_id（若是新建会话）
      if (sessionId && store.session && !store.session.id) {
        store.session = { ...store.session, id: sessionId };
      } else if (sessionId && !store.session) {
        store.session = { id: sessionId } as AISession;
      }
      store.streaming = false;
      store._currentTask = null;
      break;
    }
    case 'error': {
      const msg = String(data.message || '出错了');
      appendError(store, client_id, msg);
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
    segments: [...msg.segments, { kind: 'error', message }],
  }));
  store.streaming = false;
  store._currentTask = null;
  wx.showToast({ title: message || 'AI 出错了', icon: 'none', duration: 2500 });
}
