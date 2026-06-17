// RecipeService 接口封装
import { request } from './http';
import type { Int64Like, Recipe, RecipeDetail, TodayRecipe } from '../types/api';

export interface ListRecipesQuery {
  limit?: number;
  keyword?: string;
  kitchen_tag?: string;
  exclude_draft?: boolean;
  recipe_status?: 'draft' | 'published';
  before_id?: Int64Like;   // 游标分页：上一页最后一项 id
}

// 按食材+口味推荐的一道菜：source=library(库内已有,带 recipe_id) | ai(即兴新菜)
export interface DishSuggestion {
  title: string;
  reason?: string;
  source?: 'library' | 'ai' | string;
  recipe_id?: Int64Like;
  cover_image_url?: string;
}

export interface CreateDraftIngredient {
  group_name?: string;
  name: string;
  amount_text?: string;
  preparation?: string;
  remark?: string;
}

export interface CreateDraftStep {
  title?: string;
  description: string;
  step_type?: string;
  need_timer?: boolean;
  timer_seconds?: number;
  timer_animation?: string;
  end_condition?: string;
  heat_level?: string;
  safety_tips?: string;
  ai_hint?: string;
  media_url?: string;
  media_urls?: string[];
}

export interface CreateRecipeDraftReq {
  title: string;
  summary?: string;
  cover_image_url?: string;
  category?: string;
  total_minutes?: number;
  difficulty?: number;
  tools?: string[];
  scenario_tags?: string[];
  flavor_tags?: string[];
  ingredients: CreateDraftIngredient[];
  steps: CreateDraftStep[];
  gallery_image_urls?: string[];
  video_url?: string;
}

export interface UpdateRecipeReq extends CreateRecipeDraftReq {
  id: Int64Like;
  status?: 'draft' | 'published';
  metadata?: Record<string, unknown>;
}

export const recipeApi = {
  list(query: ListRecipesQuery = {}) {
    return request<{ recipes: Recipe[] }>({
      url: '/api/v1/recipes',
      method: 'GET',
      query,
    });
  },

  detail(id: Int64Like) {
    return request<{ detail: RecipeDetail }>({
      url: `/api/v1/recipes/${id}`,
      method: 'GET',
    });
  },

  createDraft(data: CreateRecipeDraftReq) {
    return request<{ detail: RecipeDetail }>({
      url: '/api/v1/recipes:draft',
      method: 'POST',
      data,
      loading: '保存中',
    });
  },

  update(id: Int64Like, data: UpdateRecipeReq) {
    return request<{ detail: RecipeDetail }>({
      url: `/api/v1/recipes/${id}`,
      method: 'PUT',
      data,
      loading: '保存中',
    });
  },

  delete(id: Int64Like) {
    return request<{ ok: boolean }>({
      url: `/api/v1/recipes/${id}`,
      method: 'DELETE',
      loading: '删除中',
    });
  },

  // 草稿一键发布为正式菜谱（仅翻 status，不重传食材/步骤）
  publish(id: Int64Like) {
    return request<{ recipe: Recipe }>({
      url: `/api/v1/recipes/${id}/publish`,
      method: 'POST',
      data: { recipe_id: id },
      loading: '发布中',
    });
  },

  listToday(limit?: number) {
    return request<{ items: TodayRecipe[] }>({
      url: '/api/v1/recipes/today',
      method: 'GET',
      query: { limit },
    });
  },

  // 按食材+家庭/成员口味推荐几道菜（先匹配库内已有，不足 AI 补）
  // 涉及 AI 补全，放宽超时到 50s（默认 30s 不够；后端 AI 40s 截断后会降级返回库内结果）
  recommendDishes(ingredients: string[], limit = 6) {
    return request<{ dishes: DishSuggestion[] }>({
      url: '/api/v1/recipes/recommend-dishes',
      method: 'POST',
      data: { ingredients, limit },
      loading: '推荐中',
      timeout: 50_000,
    });
  },

  // --- 收藏 ---

  addFavorite(recipeId: Int64Like) {
    return request<{ recipe: Recipe; favored: boolean }>({
      url: `/api/v1/recipes/${recipeId}/favorite`,
      method: 'POST',
      data: { recipe_id: recipeId },
    });
  },

  removeFavorite(recipeId: Int64Like) {
    return request<{ ok: boolean }>({
      url: `/api/v1/recipes/${recipeId}/favorite`,
      method: 'DELETE',
    });
  },

  listFavorites(query: { limit?: number; before_id?: Int64Like } = {}) {
    return request<{ recipes: Recipe[]; total: Int64Like }>({
      url: '/api/v1/recipes/favorites',
      method: 'GET',
      query: query as Record<string, string | number | boolean | undefined | null>,
    });
  },
};
