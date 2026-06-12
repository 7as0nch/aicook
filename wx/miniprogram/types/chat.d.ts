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
  // 工作流时间线（tool_call/agent/status 段）的折叠态与统计（store 维护）
  flow_collapsed?: boolean;
  flow_count?: number;
  // 折叠时展示的最新一条工作流文案（流式中给用户实时进度感）
  flow_live?: string;
  // 联网搜索「参考来源」段的折叠态（默认折叠，与工具时间线一致，避免铺屏）
  sources_collapsed?: boolean;
}

export type ChatSegment =
  | TextSegment
  | ReasoningSegment
  | ToolCallSegment
  | RecipeCardSegment
  | StatusSegment
  | AgentSegment
  | ApprovalSegment
  | SourcesSegment
  | ErrorSegment;

export interface TextSegment {
  kind: 'text';
  content: string;
  // 流结束后由 utils/markdown 解析出的 rich-text 节点；存在时优先用它渲染
  nodes?: unknown[];
}

export interface ReasoningSegment {
  kind: 'reasoning';
  content: string;
}

export interface ToolCallSegment {
  kind: 'tool_call';
  tool_name: string;
  // 后端 running/done 各推一次事件，按 call_id 原地更新同一段（不追加重复行）
  call_id?: string;
  status?: string;                // running | done | error
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
  // 完整草稿数据（编辑并保存用）
  draft?: Record<string, unknown>;
}

export interface AgentSegment {
  kind: 'agent';
  content: string;       // Agent 正在做什么（搜索中、查询食材中）
  trace_id?: string;     // 按 id 原地更新（running→done 同一行）
  status?: string;
}

// human-in-loop 选项（对应 backend airuntime.ApprovalOption）
export interface ApprovalChoice {
  id: string;
  title: string;
  summary?: string;
}

export interface ApprovalSegment {
  kind: 'approval';
  // 审批 ID（backend PendingApproval.ID），回传 approval_response 时必带
  approval_id?: string;
  prompt: string;
  // single = 点选即提交；multi = 多选 + 确认
  selection_mode?: 'single' | 'multi';
  allow_skip?: boolean;
  options?: ApprovalChoice[];
  // 已选中的选项 id（multi 模式本地暂存；提交后固定）
  selected_ids?: string[];
  // 选中态 map（与 selected_ids 同步维护；WXML 不支持 indexOf，用下标访问做高亮）
  selected_map?: Record<string, boolean>;
  // 用户已作答：选项变只读展示
  answered?: boolean;
  // 已作答的选项标题（历史回放时来自 approval_resolved，仅展示用）
  selected_label?: string;
}

export interface SourcesSegment {
  kind: 'sources';
  sources: Array<{
    title: string;
    url?: string;
    snippet?: string;
    site_name?: string;
  }>;
}

export interface StatusSegment {
  kind: 'status';
  message: string;
  step_id?: string;      // 按 step_id 原地更新（running→done 同一行）
  status?: string;       // running | done | skipped | blocked
}

export interface ErrorSegment {
  kind: 'error';
  message: string;
}
