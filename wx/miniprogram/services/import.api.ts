// ImportService 接口封装（图片转菜谱等异步任务）
import { request } from './http';
import type { ImportJob, Int64Like } from '../types/api';

export const importApi = {
  createImageRecipe(media_asset_ids: string[], title_hint?: string) {
    return request<{ job: ImportJob }>({
      url: '/api/v1/imports/image-recipes',
      method: 'POST',
      data: { media_asset_ids, title_hint },
      loading: '识别中',
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
