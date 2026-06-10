// KnowledgeService 接口封装（知识库 CRUD + RAG 查询 + 家庭 AI 记忆）
//
// 【预留】小程序当前没有知识库 UI 入口（产品决策：知识库管理暂只在 Web 端提供，
// Web 实现见 frontend/src/app/pages/KnowledgeBase.tsx）。本封装与 backend
// KnowledgeService 保持对齐，供后续版本接入，请勿删除。
import { request } from './http';
import type { Int64Like, KnowledgeBase, KnowledgeDocument, Source } from '../types/api';

export interface HouseholdAIMemory {
  id: Int64Like;
  household_id: Int64Like;
  content: string;
  scope?: string;
  source?: string;
  created_at?: string;
}

export const knowledgeApi = {
  createBase(name: string, description?: string) {
    return request<{ base: KnowledgeBase }>({
      url: '/api/v1/knowledge-bases',
      method: 'POST',
      data: { name, description },
      loading: '创建中',
    });
  },

  listBases() {
    return request<{ bases: KnowledgeBase[] }>({
      url: '/api/v1/knowledge-bases',
      method: 'GET',
    });
  },

  createDocument(kb_id: Int64Like, media_asset_id: Int64Like, title: string) {
    // media_asset_id 在 proto 中是 int64，以字符串发送（protojson 兼容且不丢精度）
    return request<{ document: KnowledgeDocument }>({
      url: `/api/v1/knowledge-bases/${String(kb_id)}/documents`,
      method: 'POST',
      data: { media_asset_id: String(media_asset_id), title },
      loading: '上传中',
    });
  },

  listDocuments(kb_id: Int64Like) {
    return request<{ documents: KnowledgeDocument[] }>({
      url: `/api/v1/knowledge-bases/${kb_id}/documents`,
      method: 'GET',
    });
  },

  reindex(kb_id: Int64Like) {
    return request<Record<string, never>>({
      url: `/api/v1/knowledge-bases/${kb_id}/reindex`,
      method: 'POST',
      data: {},
      loading: '重建索引',
    });
  },

  query(kb_id: Int64Like, question: string) {
    return request<{ answer: string; sources: Source[] }>({
      url: `/api/v1/knowledge-bases/${kb_id}/query`,
      method: 'POST',
      data: { question },
      loading: '查询中',
    });
  },

  listMemories() {
    return request<{ memories: HouseholdAIMemory[] }>({
      url: '/api/v1/household-ai-memories',
      method: 'GET',
    });
  },

  createMemory(content: string, scope?: string) {
    return request<{ memory: HouseholdAIMemory }>({
      url: '/api/v1/household-ai-memories',
      method: 'POST',
      data: { content, scope },
    });
  },
};
