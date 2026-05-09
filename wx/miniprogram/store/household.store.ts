// 家庭维度的元数据 store：菜谱分类标签、口味偏好。
// 用途：菜谱列表过滤、AI 偏好上下文、设置页表单。
import { observable, action } from 'mobx-miniprogram';
import { householdApi } from '../services/household.api';
import type { HouseholdPreferences, KitchenTag } from '../types/api';

export const householdStore = observable({
  tags: [] as KitchenTag[],
  preferences: null as HouseholdPreferences | null,

  loadTags: action(async function (this: typeof householdStore) {
    const res = await householdApi.listKitchenTags();
    this.tags = res.tags || [];
  }),

  loadPreferences: action(async function (this: typeof householdStore) {
    const res = await householdApi.getPreferences();
    this.preferences = res.preferences;
  }),

  savePreferences: action(async function (this: typeof householdStore, prefs: HouseholdPreferences) {
    const res = await householdApi.updatePreferences(prefs);
    this.preferences = res.preferences;
  }),
});
