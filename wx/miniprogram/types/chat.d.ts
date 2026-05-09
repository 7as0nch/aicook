// AI 流式聊天的客户端模型
// 与 services/sse.ts 配合使用

import { Recipe } from './api';

// 客户端聊天消息（用于渲染气泡）
export interface ChatMessage {
  client_id: string;            // 客户端生成的 id（id.ts）
  server_id?: string | number;  // 服务端 message id（流式完成后填）
  session_id?: string | number;
  role: 'user' | 'assistant' | 'system';
  // 多模态分段：文本、推理过程、工具调用、菜谱卡片
  segments: ChatSegment[];
  status: 'pending' | 'streaming' | 'done' | 'error';
  created_at_ms: number;
  reasoning_collapsed?: boolean;
}

export type ChatSegment =
  | TextSegment
  | ReasoningSegment
  | ToolCallSegment
  | RecipeCardSegment
  | StatusSegment
  | ErrorSegment;

export interface TextSegment {
  kind: 'text';
  content: string;
}

export interface ReasoningSegment {
  kind: 'reasoning';
  content: string;
}

export interface ToolCallSegment {
  kind: 'tool_call';
  tool_name: string;
  arguments?: string;             // JSON string
  result?: string;
}

export interface RecipeCardSegment {
  kind: 'recipe_card';
  recipe_id?: string | number;
  title: string;
  summary?: string;
  cover_image_url?: string;
  recipe?: Recipe;
}

export interface StatusSegment {
  kind: 'status';
  message: string;
}

export interface ErrorSegment {
  kind: 'error';
  message: string;
}
