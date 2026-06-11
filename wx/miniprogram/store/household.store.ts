// 家庭维度的元数据 store：菜谱分类标签、口味偏好。
// 用途：菜谱列表过滤、AI 偏好上下文、设置页表单。
import { observable, action } from 'mobx-miniprogram';
import { householdApi } from '../services/household.api';
import type { HouseholdPreferences, KitchenTag } from '../types/api';

export const householdStore = observable({
  tags: [] as KitchenTag[],
  preferences: null as HouseholdPreferences | null,
  // 首页"按类型浏览"点选类目后暂存，菜谱 Tab onShow 读取并预选（switchTab 不能带参）
  pendingCategory: '' as string,

  loadTags: action(async function (this: typeof householdStore) {
    const res = await householdApi.listKitchenTags();
    this.tags = res.tags || [];
  }),

  setPendingCategory: action(function (this: typeof householdStore, name: string) {
    this.pendingCategory = name;
  }),

  // 新建家庭类目（KitchenTag），成功后刷新 tags
  createTag: action(async function (this: typeof householdStore, name: string) {
    await householdApi.createKitchenTag(name);
    await this.loadTags();
  }),

  // 删除家庭类目（仅 type=2 用户标签可删，系统标签后端会拒绝）
  deleteTag: action(async function (this: typeof householdStore, id: KitchenTag['id']) {
    await householdApi.deleteKitchenTag(id);
    await this.loadTags();
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
