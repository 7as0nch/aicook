// 口味偏好编辑页
import { householdApi } from '../../../services/household.api';
import type { HouseholdPreferences } from '../../../types/api';

const FLAVOR_OPTIONS = ['重口味', '微辣', '清淡', '甜口', '酸口', '咸鲜'];
const SCENARIO_OPTIONS = ['早餐', '午餐', '晚餐', '夜宵', '聚餐', '便当'];
const RESTRICTION_OPTIONS = ['海鲜', '牛羊', '花生', '麸质', '乳制品', '蛋类', '辣椒'];
const TIME_OPTIONS = [
  { label: '15分钟', value: 15 },
  { label: '30分钟', value: 30 },
  { label: '60分钟', value: 60 },
  { label: '90分钟', value: 90 },
  { label: '不限', value: 0 },
];

// 数组 → 选中态 map。WXML 表达式不支持 indexOf 等方法调用（会静默失败导致
// 选中样式永远不亮），所以选中态用 map 维护，WXML 里用下标访问。
function toSelectedMap(arr: string[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const item of arr) m[item] = true;
  return m;
}

Page({
  data: {
    flavorOptions: FLAVOR_OPTIONS,
    scenarioOptions: SCENARIO_OPTIONS,
    restrictionOptions: RESTRICTION_OPTIONS,
    timeOptions: TIME_OPTIONS,
    flavor: [] as string[],
    scenarios: [] as string[],
    restrictions: [] as string[],
    // 选中态 map（与同名数组同步维护，供 WXML 高亮用）
    flavorMap: {} as Record<string, boolean>,
    scenariosMap: {} as Record<string, boolean>,
    restrictionsMap: {} as Record<string, boolean>,
    maxDifficulty: 3,
    maxMinutes: 60,
    tasteNote: '',
    saving: false,
    loaded: false,
    memberId: '' as string,        // 从厨房管理跳过来时带上：编辑该成员的偏好
    memberName: '' as string,      // 头部展示用
  },

  onLoad(query: Record<string, string>) {
    const memberId = query?.member_id ? String(query.member_id) : '';
    const memberName = query?.member_name ? decodeURIComponent(String(query.member_name)) : '';
    this.setData({ memberId, memberName });
    void this.loadPreferences();
  },

  async loadPreferences() {
    try {
      // 有 memberId → 读单个成员；否则读家庭维度（向后兼容）
      const res = this.data.memberId
        ? await householdApi.getMemberPreferences(this.data.memberId)
        : await householdApi.getPreferences();
      const p = res.preferences;
      const flavor = p.flavor || [];
      const scenarios = p.scenarios || [];
      const restrictions = p.restrictions || [];
      this.setData({
        flavor,
        scenarios,
        restrictions,
        flavorMap: toSelectedMap(flavor),
        scenariosMap: toSelectedMap(scenarios),
        restrictionsMap: toSelectedMap(restrictions),
        maxDifficulty: p.max_difficulty || 3,
        maxMinutes: p.max_minutes || 60,
        tasteNote: p.taste_note || '',
        loaded: true,
      });
    } catch (e) {
      console.error('[preferences] load fail', e);
      wx.showToast({ title: '加载偏好失败', icon: 'none' });
      this.setData({ loaded: true });
    }
  },

  onFlavorTap(e: WechatMiniprogram.BaseEvent) {
    const tag = (e.currentTarget as unknown as { dataset: { tag: string } }).dataset.tag;
    this.toggleArr('flavor', tag);
  },

  onScenarioTap(e: WechatMiniprogram.BaseEvent) {
    const tag = (e.currentTarget as unknown as { dataset: { tag: string } }).dataset.tag;
    this.toggleArr('scenarios', tag);
  },

  onRestrictionTap(e: WechatMiniprogram.BaseEvent) {
    const tag = (e.currentTarget as unknown as { dataset: { tag: string } }).dataset.tag;
    this.toggleArr('restrictions', tag);
  },

  toggleArr(key: 'flavor' | 'scenarios' | 'restrictions', tag: string) {
    const arr = (this.data[key] as string[]).slice();
    const idx = arr.indexOf(tag);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(tag);
    // 数组与选中态 map 同步更新（map 供 WXML 高亮）
    this.setData({ [key]: arr, [`${key}Map`]: toSelectedMap(arr) });
  },

  onTasteNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ tasteNote: e.detail.value });
  },

  onDifficultyTap(e: WechatMiniprogram.BaseEvent) {
    const v = Number((e.currentTarget as unknown as { dataset: { v: string } }).dataset.v);
    this.setData({ maxDifficulty: v });
  },

  onTimeTap(e: WechatMiniprogram.BaseEvent) {
    const v = Number((e.currentTarget as unknown as { dataset: { v: string } }).dataset.v);
    this.setData({ maxMinutes: v });
  },

  async onSave() {
    this.setData({ saving: true });
    try {
      const data: HouseholdPreferences = {
        flavor: this.data.flavor,
        scenarios: this.data.scenarios,
        restrictions: this.data.restrictions,
        max_difficulty: this.data.maxDifficulty,
        max_minutes: this.data.maxMinutes,
        taste_note: this.data.tasteNote.trim(),
      };
      if (this.data.memberId) {
        await householdApi.updateMemberPreferences(this.data.memberId, data);
      } else {
        await householdApi.updatePreferences(data);
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },
});
