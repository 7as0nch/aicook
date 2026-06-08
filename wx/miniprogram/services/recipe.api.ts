// RecipeService 接口封装
import { request } from './http';
import type { Int64Like, Recipe, RecipeDetail, TodayRecipe } from '../types/api';

export interface ListRecipesQuery {
  limit?: number;
  keyword?: string;
  kitchen_tag?: string;
  exclude_draft?: boolean;
  recipe_status?: 'draft' | 'published';
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

  listToday(limit?: number) {
    return request<{ items: TodayRecipe[] }>({
      url: '/api/v1/recipes/today',
      method: 'GET',
      query: { limit },
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
