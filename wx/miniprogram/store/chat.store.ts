// AI 聊天 store：当前会话 + 流式消息状态机
// 配合 services/sse.ts -> chatStream() 使用。
// 注意：mobx 数组替换比 push 更稳定，触发 wxml 重新渲染。
import { observable, action } from 'mobx-miniprogram';
import { chatStream, ChatSendRequest, SSEEvent, SSETask } from '../services/sse';
import { aiApi } from '../services/ai.api';
import { nextClientId } from '../utils/id';
import { markdownToNodes, looksLikeMarkdown } from '../utils/markdown';
import type { AISession, Int64Like } from '../types/api';
import type { ApprovalChoice, ChatMessage, ChatSegment } from '../types/chat';
import type { SSEDonePayload } from '../types/sse-events';

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

  // multi 模式下本地勾选/取消选项（提交前的暂存态）
  toggleApprovalChoice: action(function (
    this: typeof chatStore,
    msgClientId: string,
    approvalId: string,
    optionId: string,
  ) {
    patchMsg(this, msgClientId, (msg) => ({
      ...msg,
      segments: msg.segments.map((seg) => {
        if (seg.kind !== 'approval' || seg.approval_id !== approvalId || seg.answered) return seg;
        const cur = seg.selected_ids || [];
        const next = cur.includes(optionId) ? cur.filter((i) => i !== optionId) : [...cur, optionId];
        const map: Record<string, boolean> = {};
        for (const id of next) map[id] = true;
        return { ...seg, selected_ids: next, selected_map: map };
      }),
    }));
  }),

  // human-in-loop：用户对 approval 段作出选择后回传后端继续工作流。
  // confirmed=false 表示跳过（allow_skip 场景）。
  sendApproval: action(function (
    this: typeof chatStore,
    msgClientId: string,
    approvalId: string,
    chosen: ApprovalChoice[],
    confirmed = true,
  ) {
    if (this.streaming) {
      console.warn('[chatStore] still streaming, ignore approval');
      return;
    }
    // 把该 approval 段标记为已作答（选项变只读），避免重复提交
    const map: Record<string, boolean> = {};
    for (const c of chosen) map[c.id] = true;
    patchMsg(this, msgClientId, (msg) => ({
      ...msg,
      segments: msg.segments.map((seg) =>
        seg.kind === 'approval' && seg.approval_id === approvalId
          ? { ...seg, answered: true, selected_ids: chosen.map((c) => c.id), selected_map: map }
          : seg,
      ),
    }));
    // 用户侧展示所选项标题
    const label = confirmed ? (chosen.map((c) => c.title).join('、') || '已确认') : '跳过';
    const userMsg: ChatMessage = {
      client_id: nextClientId(),
      session_id: this.session?.id,
      role: 'user',
      segments: [{ kind: 'text', content: label }],
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
      // 所选标题作为 text 发送：resume 流程不消费它，但会作为用户消息内容入库，
      // 历史回放时才能看到"用户选了什么"（否则是空气泡）
      text: label,
      scene: this.session?.scene,
      reasoning_enabled: this.reasoningEnabled,
      web_search_enabled: this.webSearchEnabled,
      image_recipe_enabled: this.imageRecipeEnabled,
      approval_response: {
        approval_id: approvalId,
        option_id: chosen[0]?.id || '',
        option_ids: chosen.length > 1 ? chosen.map((c) => c.id) : undefined,
        confirmed,
      },
    };
    const task = chatStream(body, {
      onEvent: (ev) => onSSEEvent(this, assistantMsg.client_id, ev),
      onDone: () => markDone(this, assistantMsg.client_id),
      onError: (err) => appendError(this, assistantMsg.client_id, err.message),
    });
    this._currentTask = task;
  }),

  abort: action(function (this: typeof chatStore) {
    if (this._currentTask) {
      this._currentTask.abort();
      this._currentTask = null;
    }
    // 把当前 streaming 消息标为 done（并做终态整理：markdown 渲染 + 思考折叠）
    const idx = this.messages.findIndex((m) => m.status === 'streaming');
    if (idx >= 0) {
      this.messages[idx] = finalizeMessage({ ...this.messages[idx], status: 'done' });
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

  toggleFlowCollapsed: action(function (this: typeof chatStore, client_id: string) {
    const idx = this.messages.findIndex((m) => m.client_id === client_id);
    if (idx < 0) return;
    const msg = this.messages[idx];
    this.messages[idx] = { ...msg, flow_collapsed: !msg.flow_collapsed };
    this.messages = [...this.messages];
  }),
});

// ---- 内部辅助 ----

// 历史消息 → 客户端渲染模型。
// 富内容（思考过程/菜谱卡片/待选择项）持久化在 response_meta.metadata 里，
// 必须在这里重建，否则历史回放只剩 content、全是空气泡。
function toClientMessage(m: import('../types/api').AIMessage): ChatMessage {
  const segs: ChatSegment[] = [];
  // response_meta 即 ReplyMetadata 本体（见 types/api.d.ts 注释）
  const meta = m.response_meta;

  // 思考过程（默认折叠）
  if (meta?.reasoning_content) {
    segs.push({ kind: 'reasoning', content: meta.reasoning_content });
  }
  if (m.content) {
    const seg: ChatSegment = { kind: 'text', content: m.content };
    if (looksLikeMarkdown(m.content)) {
      const nodes = markdownToNodes(m.content);
      if (nodes) seg.nodes = nodes;
    }
    segs.push(seg);
  }
  // 菜谱卡片
  if (meta?.recipe_card) {
    const card = meta.recipe_card;
    segs.push({
      kind: 'recipe_card',
      recipe_id: card.recipe_id || undefined,
      title: card.title || '生成的菜谱',
      summary: card.summary,
      cover_image_url: card.cover_image_url,
      draft: card.draft,
    });
  }
  // 未作答的提问：恢复为可交互（同会话内 checkpoint 仍在时可继续作答）
  if (meta?.pending_approval) {
    const pa = meta.pending_approval;
    const options = (pa.options || [])
      .filter((o) => o && (o.id || o.title))
      .map((o) => ({ id: String(o.id || o.title || ''), title: o.title || '选项', summary: o.summary }));
    segs.push({
      kind: 'approval',
      approval_id: String(pa.id || ''),
      prompt: pa.prompt || '需要你确认',
      selection_mode: pa.selection_mode === 'multi' ? 'multi' : 'single',
      allow_skip: !!pa.allow_skip,
      options,
      selected_ids: [],
      answered: false,
    });
  }
  // 已作答的提问：只读展示所选项
  if (meta?.approval_resolved) {
    const ar = meta.approval_resolved;
    segs.push({
      kind: 'approval',
      approval_id: String(ar.approval_id || ''),
      prompt: ar.prompt || '已确认的选择',
      options: [],
      answered: true,
      selected_label: ar.title || (ar.titles || []).join('、'),
    });
  }
  if (m.response_sources && m.response_sources.length > 0) {
    segs.push({
      kind: 'sources',
      sources: m.response_sources.map((s) => ({
        title: s.title || '',
        snippet: s.snippet,
        site_name: s.site_name,
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
    reasoning_collapsed: !!meta?.reasoning_content,
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

// 工作流段（status/tool_call/agent）的 upsert：
// 后端对同一步骤的 running/done 各推一次事件，按业务 key 原地更新同一段，
// 避免时间线翻倍；同时维护 flow_count / flow_live（折叠态的计数与实时行）。
function upsertFlowSegment(
  store: typeof chatStore,
  client_id: string,
  liveText: string,
  match: (seg: ChatSegment) => boolean,
  next: ChatSegment,
): void {
  patchMsg(store, client_id, (msg) => {
    const segments = msg.segments.slice();
    const idx = segments.findIndex(match);
    if (idx >= 0) {
      segments[idx] = next;
    } else {
      segments.push(next);
    }
    const flowCount = segments.filter(
      (s) => s.kind === 'status' || s.kind === 'tool_call' || s.kind === 'agent',
    ).length;
    return {
      ...msg,
      segments,
      flow_count: flowCount,
      flow_live: liveText,
      // 默认折叠（流式中折叠态仍显示最新一条 flow_live）
      flow_collapsed: msg.flow_collapsed !== false,
    };
  });
}

// SSE 事件分发：payload 类型见 types/sse-events.d.ts（与 chat_http.go 对齐）。
// payload 是边界断言而非运行时校验，所有字段读取仍做空值容错。
function onSSEEvent(store: typeof chatStore, client_id: string, ev: SSEEvent): void {
  switch (ev.event) {
    case 'start': {
      // 首次发送时后端回写 session_id，要存回 store 以便后续追加消息
      const { session_id: sid, scene, title } = ev.data || {};
      if (sid && !store.session) {
        store.session = { id: sid, scene, title } as AISession;
      } else if (sid && store.session && !store.session.id) {
        store.session = { ...store.session, id: sid };
      }
      break;
    }
    case 'answer_delta': {
      patchMsg(store, client_id, (msg) => appendText(msg, ev.data?.content || ''));
      break;
    }
    case 'reasoning_delta': {
      patchMsg(store, client_id, (msg) => appendReasoning(msg, ev.data?.content || ''));
      break;
    }
    case 'agent_delta': {
      const data = ev.data || {};
      const text = data.detail || data.content || data.name || '';
      if (!text) break;
      const traceId = String(data.id || data.name || text);
      upsertFlowSegment(
        store, client_id, text,
        (seg) => seg.kind === 'agent' && seg.trace_id === traceId,
        { kind: 'agent', content: text, trace_id: traceId, status: data.status || '' },
      );
      break;
    }
    case 'status_delta': {
      const data = ev.data || {};
      const text = data.title || data.content || '';
      if (!text) break;
      // 同一 step 的 running/done 是两条事件，按 step_id 原地更新，不追加重复行
      const stepId = String(data.step_id || data.call_id || text);
      upsertFlowSegment(
        store, client_id, text,
        (seg) => seg.kind === 'status' && seg.step_id === stepId,
        { kind: 'status', message: text, step_id: stepId, status: data.status || '' },
      );
      break;
    }
    case 'tool_call': {
      const data = ev.data || {};
      const name = data.tool_name || data.name || '';
      const callId = String(data.call_id || name);
      upsertFlowSegment(
        store, client_id, `调用 ${name}`,
        (seg) => seg.kind === 'tool_call' && seg.call_id === callId,
        {
          kind: 'tool_call',
          tool_name: name,
          call_id: callId,
          status: data.status || '',
          arguments: data.arguments ? String(data.arguments) : undefined,
          result: data.result ? String(data.result) : undefined,
        },
      );
      break;
    }
    case 'recipe_card': {
      const data = ev.data || {};
      // 卡片在 metadata 的 card 对象里（backend emitRecipeCard），平铺字段仅作兼容兜底
      const card = data.card || data;
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [
          ...msg.segments,
          {
            kind: 'recipe_card',
            recipe_id: card.recipe_id || undefined,
            title: card.title || '生成的菜谱',
            summary: card.summary,
            cover_image_url: card.cover_image_url,
            draft: card.draft,
          },
        ],
      }));
      break;
    }
    case 'approval': {
      const data = ev.data || {};
      // 完整审批对象在 metadata 的 approval 字段（含 options/selection_mode），
      // content 只是 prompt 文案（见 backend stream_bridge.go:181）
      const detail = data.approval;
      const options = (detail?.options || [])
        .filter((o) => o && (o.id || o.title))
        .map((o) => ({
          id: String(o.id || o.title || ''),
          title: o.title || o.value || '选项',
          summary: o.summary,
        }));
      patchMsg(store, client_id, (msg) => ({
        ...msg,
        segments: [
          ...msg.segments,
          {
            kind: 'approval',
            approval_id: String(detail?.id || data.call_id || ''),
            prompt: detail?.prompt || data.content || '需要你确认',
            selection_mode: detail?.selection_mode === 'multi' ? 'multi' : 'single',
            allow_skip: !!detail?.allow_skip,
            options,
            selected_ids: [],
            answered: false,
          },
        ],
      }));
      // 出现待选择项时本轮流结束等待用户，streaming 状态交给 done/onDone 收尾
      break;
    }
    case 'done': {
      const data: SSEDonePayload = ev.data || {};
      // 写入完整回复来源 + server_id
      const sources = data.reply_sources || [];
      const assistantId = data.assistant_message_id;
      const sessionId = data.session_id;
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
                site_name: s.site_name,
              })),
            },
          ];
        }
        // 终态整理：文本段转 markdown 节点 + 思考过程自动折叠
        return finalizeMessage(next);
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
      appendError(store, client_id, ev.data?.message || '出错了');
      break;
    }
    default: {
      // 未知事件已在 sse.ts parseFrame 中过滤，这里兜底记录
      const unknown = ev as { event: string; data: unknown };
      console.debug('[chatStore] ignored event', unknown.event, unknown.data);
    }
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

// finalizeMessage 流结束时的终态整理：
//   1) 文本段含 markdown 语法时解析为 rich-text 节点（流式期间为性能用纯文本）
//   2) 有思考过程的消息自动折叠（用户可点开）
function finalizeMessage(msg: ChatMessage): ChatMessage {
  let hasReasoning = false;
  const segments = msg.segments.map((seg) => {
    if (seg.kind === 'reasoning') hasReasoning = true;
    if (seg.kind === 'text' && !seg.nodes && looksLikeMarkdown(seg.content)) {
      const nodes = markdownToNodes(seg.content);
      if (nodes) return { ...seg, nodes };
    }
    return seg;
  });
  return {
    ...msg,
    segments,
    reasoning_collapsed: hasReasoning ? true : msg.reasoning_collapsed,
  };
}

function markDone(store: typeof chatStore, client_id: string): void {
  patchMsg(store, client_id, (msg) => finalizeMessage({ ...msg, status: 'done' }));
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
