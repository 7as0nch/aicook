// 计划页（设计稿 06）
// 周日历 + 三餐卡片 + 采购清单进度
import { planStore } from '../../../store/plan.store';
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import type { Recipe } from '../../../types/api';

interface DishItem {
  id?: string;
  title?: string;
  cover_image_url?: string;
  category?: string;
  total_minutes?: number;
  calories?: number;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getMonday(d: Date) {
  const r = new Date(d);
  const w = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - w);
  r.setHours(0, 0, 0, 0);
  return r;
}

interface WeekDay { date: string; day: number; label: string; }

const WEEK_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    today: '',
    weekStart: '',
    selectedDate: '',
    weekDays: [] as WeekDay[],
    weekRangeLabel: '',
    breakfast: [] as DishItem[],
    lunch: [] as DishItem[],
    dinner: [] as DishItem[],
    shoppingCheckedCount: 0,
    shoppingTotal: 0,
    shoppingPreviewNames: [] as string[],
    shoppingPreviewText: '',
    shoppingProgressPct: 0,
    loading: false,
  },

  onLoad() {
    const now = new Date();
    const todayStr = formatDate(now);
    const monday = getMonday(now);
    const ws = formatDate(monday);
    // 构造 7 天数据
    const weekDays: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDays.push({ date: formatDate(d), day: d.getDate(), label: WEEK_LABEL[d.getDay()] });
    }
    const last = new Date(monday);
    last.setDate(monday.getDate() + 6);
    const rangeLabel = `${monday.getMonth() + 1}月${monday.getDate()}日 - ${last.getMonth() + 1}月${last.getDate()}日`;
    this.setData({
      today: todayStr,
      weekStart: ws,
      selectedDate: todayStr,
      weekDays,
      weekRangeLabel: rangeLabel,
    });

    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings = createStoreBindings(this, {
      store: planStore,
      fields: [] as const,
      actions: [] as const,
    });

    void this.loadAll();
  },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 2 });
  },

  onUnload() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings?.destroyStoreBindings();
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      await Promise.all([
        planStore.loadPlan(this.data.weekStart).catch(() => undefined),
        planStore.loadShopping(this.data.weekStart).catch(() => undefined),
      ]);
      this.rebuildMeals();
      this.rebuildShopping();
    } finally {
      this.setData({ loading: false });
    }
  },

  rebuildMeals() {
    const plan = planStore.plan;
    if (!plan?.days) {
      this.setData({ breakfast: [], lunch: [], dinner: [] });
      return;
    }
    const dayKey = this.data.selectedDate;
    const day = (plan.days as Record<string, unknown>)[dayKey] as { breakfast?: unknown; lunch?: unknown; dinner?: unknown } | undefined;
    const toDishes = (raw: unknown): DishItem[] => {
      if (!Array.isArray(raw)) return [];
      return raw.map((it: unknown) => {
        const r = (it && typeof it === 'object') ? (it as Record<string, unknown>) : {};
        const recipe = (r.recipe && typeof r.recipe === 'object' ? r.recipe : r) as Partial<Recipe & { calories?: number }>;
        return {
          id: recipe.id ? String(recipe.id) : undefined,
          title: recipe.title || (r.title as string) || '未命名',
          cover_image_url: recipe.cover_image_url || (r.cover_image_url as string),
          category: recipe.category || (r.category as string),
          total_minutes: recipe.total_minutes || (r.total_minutes as number),
          calories: (r.calories as number) || recipe.calories,
        };
      });
    };
    this.setData({
      breakfast: toDishes(day?.breakfast),
      lunch: toDishes(day?.lunch),
      dinner: toDishes(day?.dinner),
    });
  },

  rebuildShopping() {
    const items = planStore.shoppingItems || [];
    const checked = items.filter(it => it.checked).length;
    const names = items.slice(0, 5).map(it => it.ingredient_name);
    const previewText = items.length
      ? `${names.join(' · ')}${items.length > 5 ? ` · 还有 ${items.length - 5} 项` : ''}`
      : '';
    const pct = items.length ? Math.round((checked / items.length) * 100) : 0;
    this.setData({
      shoppingCheckedCount: checked,
      shoppingTotal: items.length,
      shoppingPreviewNames: names,
      shoppingPreviewText: previewText,
      shoppingProgressPct: pct,
    });
  },

  onDayTap(e: WechatMiniprogram.BaseEvent) {
    const date = (e.currentTarget as unknown as { dataset: { date: string } }).dataset.date;
    if (!date) return;
    this.setData({ selectedDate: date });
    this.rebuildMeals();
  },

  onMealAdd() {
    wx.showToast({ title: '请在菜谱列表选择加入', icon: 'none' });
  },

  onDishTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id?: string } }).dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onShoppingTap() {
    wx.navigateTo({ url: '/pages/plan/shopping/index' });
  },

  async onGeneratePlan() {
    wx.showLoading({ title: 'AI 生成中…' });
    try {
      await planStore.generatePlan(this.data.weekStart);
      this.rebuildMeals();
      wx.hideLoading();
      wx.showToast({ title: '计划已更新', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },
});
