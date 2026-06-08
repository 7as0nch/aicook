// HouseholdService 接口封装
import { request } from './http';
import type {
  HouseholdSummary,
  HouseholdPreferences,
  HouseholdMemberDetail,
  Int64Like,
  KitchenTag,
  Recipe,
} from '../types/api';

export const householdApi = {
  createHousehold(name: string) {
    return request<{ household: HouseholdSummary }>({
      url: '/api/v1/households',
      method: 'POST',
      data: { name },
      loading: '创建中',
    });
  },

  createShareCode() {
    return request<{ household: HouseholdSummary }>({
      url: '/api/v1/households/share-code',
      method: 'POST',
      data: {},
      loading: '生成中',
    });
  },

  getKitchenByShareCode(share_code: string) {
    return request<{ household: HouseholdSummary; recipes: { recipe: Recipe }[] }>({
      url: `/api/v1/households/share/${encodeURIComponent(share_code)}`,
      method: 'GET',
    });
  },

  importSharedRecipes(share_code: string, recipe_ids: Int64Like[], kitchen_tag_id?: Int64Like, kitchen_tag_name?: string) {
    return request<{ recipes: Recipe[]; kitchen_tag?: KitchenTag }>({
      url: `/api/v1/households/share/${encodeURIComponent(share_code)}:import`,
      method: 'POST',
      data: { share_code, recipe_ids, kitchen_tag_id, kitchen_tag_name },
      loading: '导入中',
    });
  },

  listKitchenTags() {
    return request<{ tags: KitchenTag[] }>({
      url: '/api/v1/kitchen-tags',
      method: 'GET',
    });
  },

  createKitchenTag(name: string, icon?: string, color?: string) {
    return request<{ tag: KitchenTag }>({
      url: '/api/v1/kitchen-tags',
      method: 'POST',
      data: { name, icon, color },
    });
  },

  updateKitchenTag(id: Int64Like, name?: string, icon?: string, color?: string) {
    return request<{ tag: KitchenTag }>({
      url: `/api/v1/kitchen-tags/${id}`,
      method: 'PATCH',
      data: { id, name, icon, color },
    });
  },

  deleteKitchenTag(id: Int64Like) {
    return request<Record<string, never>>({
      url: `/api/v1/kitchen-tags/${id}`,
      method: 'DELETE',
    });
  },

  getPreferences() {
    return request<{ preferences: HouseholdPreferences }>({
      url: '/api/v1/households/current/preferences',
      method: 'GET',
    });
  },

  updatePreferences(preferences: HouseholdPreferences) {
    return request<{ preferences: HouseholdPreferences }>({
      url: '/api/v1/households/current/preferences',
      method: 'PUT',
      data: { preferences },
      loading: '保存中',
    });
  },

  listMembers(householdId: Int64Like) {
    return request<{ members: HouseholdMemberDetail[] }>({
      url: `/api/v1/households/${householdId}/members`,
      method: 'GET',
    });
  },
};
