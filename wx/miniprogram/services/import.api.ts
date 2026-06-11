// ImportService 接口封装（图片转菜谱等识别任务）
import { request } from './http';
import type { ImportJob, Int64Like } from '../types/api';

// 后端 CreateImageRecipe 是同步执行（AI 识别完成才返回），多模态 + OCR 兜底链路
// 可能耗时数分钟，必须显式放宽客户端超时（与 backend ai.request_timeout 对齐）
const IMAGE_RECIPE_TIMEOUT_MS = 300_000;

// job.status 的终态：后端成功时置 review_required（草稿已生成待确认），没有 'success'
export function isImportJobDone(status?: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'review_required' || s === 'success' || s === 'completed';
}

export function isImportJobFailed(status?: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'failed' || s === 'error';
}

export const importApi = {
  createImageRecipe(media_asset_ids: string[], title_hint?: string) {
    return request<{ job: ImportJob }>({
      url: '/api/v1/imports/image-recipes',
      method: 'POST',
      data: { media_asset_ids, title_hint },
      loading: '识别中',
      timeout: IMAGE_RECIPE_TIMEOUT_MS,
    });
  },

  getImportJob(job_id: Int64Like) {
    return request<{ job: ImportJob }>({
      url: `/api/v1/imports/${job_id}`,
      method: 'GET',
      toastError: false,
    });
  },
};
