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

Page({
  data: {
    flavorOptions: FLAVOR_OPTIONS,
    scenarioOptions: SCENARIO_OPTIONS,
    restrictionOptions: RESTRICTION_OPTIONS,
    timeOptions: TIME_OPTIONS,
    flavor: [] as string[],
    scenarios: [] as string[],
    restrictions: [] as string[],
    maxDifficulty: 3,
    maxMinutes: 60,
    saving: false,
    loaded: false,
  },

  onLoad() {
    void this.loadPreferences();
  },

  async loadPreferences() {
    try {
      const res = await householdApi.getPreferences();
      const p = res.preferences;
      this.setData({
        flavor: p.flavor || [],
        scenarios: p.scenarios || [],
        restrictions: p.restrictions || [],
        maxDifficulty: p.max_difficulty || 3,
        maxMinutes: p.max_minutes || 60,
        loaded: true,
      });
    } catch (e) {
      console.error('[preferences] load fail', e);
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
    this.setData({ [key]: arr });
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
      };
      await householdApi.updatePreferences(data);
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
