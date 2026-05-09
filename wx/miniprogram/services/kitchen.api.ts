// KitchenService 接口封装（周计划 / 购物清单 / 库存 / 分享 / 烹饪历史）
import { request } from './http';
import type {
  CookingHistoryEntry,
  Int64Like,
  InventoryItem,
  InventoryRecommendation,
  MealPlanWeek,
  Recipe,
  RecipeShareSummary,
  ShoppingList,
  ShoppingListItem,
  RecipeDetail,
} from '../types/api';

export interface SaveMealPlanReq {
  week_start_date: string;
  days: Record<string, unknown>;
}

export interface UpsertInventoryItem {
  id?: Int64Like;
  kind: string;
  name: string;
  category?: string;
  quantity_value?: number;
  unit?: string;
  quantity_text?: string;
  source_type?: string;
  confidence?: number;
  status?: string;
}

export interface PatchInventoryItemReq {
  item_id: Int64Like;
  kind?: string;
  name?: string;
  category?: string;
  quantity_value?: number;
  unit?: string;
  quantity_text?: string;
  source_type?: string;
  confidence?: number;
  status?: string;
  expires_at?: string;
  last_seen_at?: string;
}

export interface PatchShoppingListItemReq {
  list_id: Int64Like;
  item_id: Int64Like;
  checked?: boolean;
  note?: string;
  quantity_text?: string;
  category?: string;
}

export interface CreateCookingHistoryReq {
  recipe_id: Int64Like;
  started_at_ms: number;
  completed_at_ms?: number;
  duration_seconds: number;
  completed_step_count: number;
  rating?: number;
  note?: string;
}

export const kitchenApi = {
  // ----- 周计划 -----
  getMealPlan(week_start?: string) {
    return request<{ plan: MealPlanWeek }>({
      url: '/api/v1/meal-plans/current',
      method: 'GET',
      query: { week_start },
    });
  },

  saveMealPlan(req: SaveMealPlanReq) {
    return request<{ plan: MealPlanWeek }>({
      url: '/api/v1/meal-plans/current',
      method: 'PUT',
      data: req,
      loading: '保存中',
    });
  },

  generateMealPlan(week_start?: string) {
    return request<{ plan: MealPlanWeek }>({
      url: '/api/v1/meal-plans/current:generate',
      method: 'POST',
      data: { week_start },
      loading: 'AI 生成中',
    });
  },

  // ----- 购物清单 -----
  getShoppingList(week_start?: string) {
    return request<{ list: ShoppingList; items: ShoppingListItem[] }>({
      url: '/api/v1/shopping-lists/current',
      method: 'GET',
      query: { week_start },
    });
  },

  generateShoppingList(week_start?: string) {
    return request<{ list: ShoppingList; items: ShoppingListItem[] }>({
      url: '/api/v1/shopping-lists:generate',
      method: 'POST',
      data: { week_start },
      loading: '生成中',
    });
  },

  patchShoppingItem(req: PatchShoppingListItemReq) {
    return request<{ item: ShoppingListItem }>({
      url: `/api/v1/shopping-lists/${req.list_id}/items/${req.item_id}`,
      method: 'PATCH',
      data: req,
      toastError: false,
    });
  },

  completeShoppingList(list_id: Int64Like) {
    return request<{ list: ShoppingList }>({
      url: `/api/v1/shopping-lists/${list_id}:complete`,
      method: 'POST',
      data: { list_id },
      loading: '完成中',
    });
  },

  // ----- 库存 -----
  listInventory(keyword?: string) {
    return request<{ items: InventoryItem[] }>({
      url: '/api/v1/inventory-items',
      method: 'GET',
      query: { keyword },
    });
  },

  upsertInventory(items: UpsertInventoryItem[]) {
    return request<{ items: InventoryItem[] }>({
      url: '/api/v1/inventory-items:upsert',
      method: 'POST',
      data: { items },
      loading: '保存中',
    });
  },

  patchInventory(req: PatchInventoryItemReq) {
    return request<{ item: InventoryItem }>({
      url: `/api/v1/inventory-items/${req.item_id}`,
      method: 'PATCH',
      data: req,
    });
  },

  inventoryRecommendations(limit?: number) {
    return request<{ items: InventoryRecommendation[] }>({
      url: '/api/v1/inventory-items/recommendations',
      method: 'GET',
      query: { limit },
    });
  },

  // ----- 菜谱分享 -----
  createRecipeShare(id: Int64Like) {
    return request<{ share: RecipeShareSummary; detail: RecipeDetail }>({
      url: `/api/v1/recipes/${id}/share`,
      method: 'POST',
      data: { id },
      loading: '生成中',
    });
  },

  previewRecipeShare(share_code: string) {
    return request<{ share: RecipeShareSummary; detail: RecipeDetail }>({
      url: `/api/v1/recipe-shares/${encodeURIComponent(share_code)}`,
      method: 'GET',
    });
  },

  importRecipeShare(share_code: string) {
    return request<{ recipe: Recipe }>({
      url: `/api/v1/recipe-shares/${encodeURIComponent(share_code)}:import`,
      method: 'POST',
      data: { share_code },
      loading: '导入中',
    });
  },

  // ----- 烹饪历史 -----
  createCookingHistory(req: CreateCookingHistoryReq) {
    return request<{ entry: CookingHistoryEntry }>({
      url: '/api/v1/cooking-history',
      method: 'POST',
      data: req,
      toastError: false,
    });
  },

  listCookingHistory(limit?: number, before_id?: Int64Like) {
    return request<{ entries: CookingHistoryEntry[]; next_cursor_id?: Int64Like }>({
      url: '/api/v1/cooking-history',
      method: 'GET',
      query: { limit, before_id: before_id ? String(before_id) : undefined },
    });
  },

  listRecentCookingHistory(limit?: number) {
    return request<{ entries: CookingHistoryEntry[] }>({
      url: '/api/v1/cooking-history/recent',
      method: 'GET',
      query: { limit },
    });
  },
};
