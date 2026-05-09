// AIService（非流式）接口封装
// 流式聊天见 services/sse.ts -> chatStream()
import { request } from './http';
import type { AIMessage, AISession, Attachment, Int64Like, QuoteContext, Source } from '../types/api';

export interface CreateSessionReq {
  scene?: string;
  title?: string;
  recipe_id?: Int64Like;
  context?: Record<string, unknown>;
}

export interface SendMessageReply {
  session: AISession;
  user_message: AIMessage;
  assistant_message: AIMessage;
  reply_content: string;
  reply_mode?: string;
  reply_sources?: Source[];
}

export const aiApi = {
  createSession(data: CreateSessionReq) {
    return request<{ session: AISession }>({
      url: '/api/v1/ai/sessions',
      method: 'POST',
      data,
    });
  },

  // 非流式发送（流式见 chatStream）
  sendMessage(session_id: Int64Like, text: string, opts?: { scene?: string; attachments?: Attachment[]; quote_context?: QuoteContext }) {
    return request<SendMessageReply>({
      url: `/api/v1/ai/sessions/${session_id}/messages`,
      method: 'POST',
      data: { session_id, text, ...opts },
    });
  },

  listSessions(scene?: string, limit?: number) {
    return request<{ sessions: AISession[] }>({
      url: '/api/v1/ai/sessions',
      method: 'GET',
      query: { scene, limit },
    });
  },

  listMessages(session_id: Int64Like, limit?: number) {
    return request<{ session: AISession; messages: AIMessage[] }>({
      url: `/api/v1/ai/sessions/${session_id}/messages`,
      method: 'GET',
      query: { limit },
    });
  },

  deleteSession(session_id: Int64Like) {
    return request<{ session_id: Int64Like }>({
      url: `/api/v1/ai/sessions/${session_id}`,
      method: 'DELETE',
      loading: '删除中',
    });
  },
};
