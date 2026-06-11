// /chat/send SSE 事件 payload 类型定义。
// 与 backend/internal/server/chat_http.go 的各 writeSSE 调用点逐一对齐；
// 后端字段变更时必须同步本文件（SSE 不走 proto，无法自动生成）。
//
// 注意：delta 类事件的 payload 由固定字段（content/run_id/message_id/seq/part_type/call_id）
// 加 StreamEvent.Metadata 平铺组成，因此带索引签名容纳扩展键。
import type { Int64Like, Source } from './api';

// event: start —— 流开始，回传会话信息
export interface SSEStartPayload {
  session_id?: string;
  scene?: string;
  title?: string;
}

// delta 类事件的公共字段
export interface SSEDeltaPayload {
  content?: string;
  run_id?: string;
  message_id?: string | number;
  seq?: number;
  part_type?: string;
  call_id?: string;
  [key: string]: unknown;
}

// event: status_delta —— graph 工作流步骤（running/done 各推一次，按 step_id 合并）
export interface SSEStatusPayload extends SSEDeltaPayload {
  step_id?: string;
  title?: string;
  status?: string;
  detail?: string;
}

// event: agent_delta —— 子 agent 调度状态（按 id 合并）
export interface SSEAgentPayload extends SSEDeltaPayload {
  id?: string;
  name?: string;
  status?: string;
  detail?: string;
}

// event: tool_call —— metadata 中平铺工具调用信息（running/done 各推一次，按 call_id 合并）
export interface SSEToolCallPayload extends SSEDeltaPayload {
  tool_name?: string;
  name?: string;
  status?: string;
  arguments?: string;
  result?: string;
}

// 菜谱卡片对象（对应 backend airuntime.RecipeCard，经 metadata["card"] 传输，
// 见 stream_bridge.go emitRecipeCard）
export interface SSERecipeCardDetail {
  recipe_id?: string;
  title?: string;
  summary?: string;
  cover_image_url?: string;
  ingredients?: string[];
  time?: string;
  difficulty?: string;
  status?: string;
  source?: string;
  is_recipe?: boolean;
  reject_reason?: string;
  // 完整草稿（TextRecipeDraft，字段与 editor 的 DraftPayload 对齐），未落库时用它进编辑页
  draft?: Record<string, unknown>;
}

// event: recipe_card —— 卡片在 card 字段（注意不是平铺）
export interface SSERecipeCardPayload extends SSEDeltaPayload {
  card?: SSERecipeCardDetail;
  // 兼容历史平铺字段
  recipe_id?: Int64Like;
  title?: string;
  summary?: string;
  cover_image_url?: string;
  draft?: Record<string, unknown>;
}

// human-in-loop 审批选项（对应 backend airuntime.ApprovalOption）
export interface SSEApprovalOption {
  id?: string;
  title?: string;
  summary?: string;
  preference_key?: string;
  value?: string;
}

// 审批对象（对应 backend airuntime.PendingApproval，经 metadata["approval"] 平铺传输）
export interface SSEApprovalDetail {
  id?: string;
  kind?: string;
  prompt?: string;
  status?: string;
  selection_mode?: string;
  step_index?: number;
  step_total?: number;
  allow_skip?: boolean;
  selected_option_ids?: string[];
  options?: SSEApprovalOption[];
}

// event: approval —— 需要用户确认/选择的操作。
// content=prompt、call_id=审批 ID，完整对象在 approval 字段（见 chat_http.go + stream_bridge.go:181）
export interface SSEApprovalPayload extends SSEDeltaPayload {
  prompt?: string;
  approval?: SSEApprovalDetail;
}

// event: done —— 流结束，附完整回复元数据
export interface SSEDonePayload {
  session_id?: string;
  user_message_id?: string;
  assistant_message_id?: string;
  run_id?: string;
  reply_content?: string;
  reasoning_content?: string;
  reply_mode?: string;
  reply_model?: string;
  reply_sources?: Source[];
  reply_sources_count?: number;
  search_results?: unknown;
  is_fallback?: boolean;
  reply_metadata?: Record<string, unknown>;
  knowledge_ingest_watch?: Array<{ asset_id: string; name?: string }>;
}

// event: error
export interface SSEErrorPayload {
  message?: string;
}

// 判别联合：以 event 字段收窄各事件的 data 类型。
// payload 来自 JSON.parse，类型是边界处的断言而非运行时校验，消费方仍需做空值容错。
export type ChatSSEEvent =
  | { event: 'start'; data: SSEStartPayload; raw: string }
  | { event: 'answer_delta'; data: SSEDeltaPayload; raw: string }
  | { event: 'reasoning_delta'; data: SSEDeltaPayload; raw: string }
  | { event: 'status_delta'; data: SSEStatusPayload; raw: string }
  | { event: 'agent_delta'; data: SSEAgentPayload; raw: string }
  | { event: 'tool_call'; data: SSEToolCallPayload; raw: string }
  | { event: 'recipe_card'; data: SSERecipeCardPayload; raw: string }
  | { event: 'approval'; data: SSEApprovalPayload; raw: string }
  | { event: 'done'; data: SSEDonePayload; raw: string }
  | { event: 'error'; data: SSEErrorPayload; raw: string };

export type ChatSSEEventType = ChatSSEEvent['event'];
