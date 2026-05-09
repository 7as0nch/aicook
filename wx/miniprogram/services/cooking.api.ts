// CookingService（实时烹饪进度）接口封装
import { request } from './http';
import type { ActiveCooking, Int64Like } from '../types/api';

export interface UpsertActiveCookingReq {
  recipe_id: Int64Like;
  step_index: number;
  total_steps?: number;
  timer_total_seconds?: number;
  timer_started_at_ms?: number;       // 0 表示暂停
  timer_paused_remaining?: number;    // 暂停时剩余秒数
}

export const cookingApi = {
  listActive() {
    return request<{ items: ActiveCooking[] }>({
      url: '/api/v1/cooking/active',
      method: 'GET',
      toastError: false,
    });
  },

  upsertActive(req: UpsertActiveCookingReq) {
    return request<{ item: ActiveCooking }>({
      url: `/api/v1/cooking/active/${req.recipe_id}`,
      method: 'PUT',
      data: req,
      toastError: false,
    });
  },

  deleteActive(recipe_id: Int64Like) {
    return request<Record<string, never>>({
      url: `/api/v1/cooking/active/${recipe_id}`,
      method: 'DELETE',
      toastError: false,
    });
  },
};
