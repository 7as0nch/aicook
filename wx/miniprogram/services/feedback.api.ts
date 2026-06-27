// FeedbackService 接口封装：用户意见反馈
import { request } from './http';
import type {
  Feedback,
  CreateFeedbackReply,
  ListFeedbacksReply,
} from '../types/generated/api/aicook/v1/feedback';

export type { Feedback };

export interface SubmitFeedbackInput {
  category: string;            // "suggestion" | "bug" | "other"
  content: string;
  image_asset_ids?: string[];  // media_assets.id（int64 以字符串传，protojson 兼容）
  contact?: string;
}

export const feedbackApi = {
  // 提交一条反馈
  submit(input: SubmitFeedbackInput) {
    return request<CreateFeedbackReply>({
      url: '/api/v1/feedbacks',
      method: 'POST',
      data: {
        category: input.category,
        content: input.content,
        // int64 一律以字符串发送，避免精度丢失；undefined 字段不下发
        image_asset_ids: (input.image_asset_ids || []).map(String),
        contact: input.contact || '',
      },
      loading: '提交中',
    });
  },

  // 拉取当前用户的反馈列表（游标分页，id 倒序）
  list(params?: { limit?: number; before_id?: string }) {
    return request<ListFeedbacksReply>({
      url: '/api/v1/feedbacks',
      method: 'GET',
      query: {
        limit: params?.limit,
        before_id: params?.before_id,
      },
    });
  },
};
