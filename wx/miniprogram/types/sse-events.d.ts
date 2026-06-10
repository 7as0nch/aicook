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

// event: tool_call —— metadata 中平铺工具调用信息
export interface SSEToolCallPayload extends SSEDeltaPayload {
  tool_name?: string;
  name?: string;
  arguments?: string;
  result?: string;
}

// event: recipe_card —— metadata 中平铺菜谱卡片信息
export interface SSERecipeCardPayload extends SSEDeltaPayload {
  recipe_id?: Int64Like;
  title?: string;
  summary?: string;
  cover_image_url?: string;
  draft?: Record<string, unknown>;
}

// event: approval —— 需要用户确认的操作
export interface SSEApprovalPayload extends SSEDeltaPayload {
  prompt?: string;
  options?: Array<{ label: string; value: string }>;
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
  | { event: 'status_delta'; data: SSEDeltaPayload; raw: string }
  | { event: 'agent_delta'; data: SSEDeltaPayload; raw: string }
  | { event: 'tool_call'; data: SSEToolCallPayload; raw: string }
  | { event: 'recipe_card'; data: SSERecipeCardPayload; raw: string }
  | { event: 'approval'; data: SSEApprovalPayload; raw: string }
  | { event: 'done'; data: SSEDonePayload; raw: string }
  | { event: 'error'; data: SSEErrorPayload; raw: string };

export type ChatSSEEventType = ChatSSEEvent['event'];
