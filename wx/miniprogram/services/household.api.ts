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

  // 新增「虚拟成员」（user_id=0），owner only
  addMember(householdId: Int64Like, displayName: string, emoji?: string, preferences?: HouseholdPreferences) {
    const data: { household_id: Int64Like; display_name: string; emoji?: string; preferences?: HouseholdPreferences } = {
      household_id: householdId,
      display_name: displayName,
    };
    if (emoji) data.emoji = emoji;
    if (preferences) data.preferences = preferences;
    return request<{ member: HouseholdMemberDetail }>({
      url: `/api/v1/households/${householdId}/members`,
      method: 'POST',
      data,
      loading: '添加中',
    });
  },

  // 软删成员（owner only，不能删 owner 自己）
  removeMember(memberId: Int64Like) {
    return request<Record<string, never>>({
      url: `/api/v1/households/members/${memberId}`,
      method: 'DELETE',
    });
  },

  // 读单个成员个人口味
  getMemberPreferences(memberId: Int64Like) {
    return request<{ preferences: HouseholdPreferences }>({
      url: `/api/v1/households/members/${memberId}/preferences`,
      method: 'GET',
    });
  },

  // 改单个成员口味（owner 或本人）
  updateMemberPreferences(memberId: Int64Like, preferences: HouseholdPreferences) {
    return request<{ preferences: HouseholdPreferences }>({
      url: `/api/v1/households/members/${memberId}/preferences`,
      method: 'PUT',
      data: { preferences },
      loading: '保存中',
    });
  },
};
