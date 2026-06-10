// 计划页（设计稿 06）
// 周日历 + 三餐卡片 + 采购清单进度
import { planStore } from '../../../store/plan.store';
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { hasToken } from '../../../utils/auth-guard';
import { on, EVENTS } from '../../../utils/eventbus';
import type { MealPlanDish, MealPlanDishInput, MealSlotKey, Recipe } from '../../../types/api';

// 页面展示用的菜品行（由 MealPlanDish 映射而来）
interface DishItem {
  key: string;        // wx:key 用，取计划条目 id
  recipeId: string;   // 点击跳菜谱详情用（可能为空：纯文字菜品）
  title: string;
  note: string;
}

// 与 backend biz/kitchen.orderedDayKeys() 对齐：days 的外层 key 是星期名
const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MEAL_SLOTS: MealSlotKey[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABEL: Record<MealSlotKey, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };

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

// 日期串（YYYY-MM-DD）→ 后端 days 的星期 key；'/' 替换为兼容 iOS 的日期解析
function weekdayKeyOf(dateStr: string): string {
  const d = new Date(dateStr.replace(/-/g, '/'));
  return WEEKDAY_KEYS[(d.getDay() + 6) % 7];
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

    const self = this as unknown as {
      storeBindings?: { destroyStoreBindings: () => void };
      _offHouseholdSwitched?: () => void;
      _lastLoadAt?: number;
    };
    self.storeBindings = createStoreBindings(this, {
      store: planStore,
      fields: [] as const,
      actions: [] as const,
    });
    // 切家庭后周计划属于新家庭：失效缓存戳，下次 onShow 立即重新拉取（防御性兜底）
    self._offHouseholdSwitched = on(EVENTS.HOUSEHOLD_SWITCHED, () => {
      self._lastLoadAt = 0;
    });

    // onLoad 不主动 loadAll；交给 onShow 统一处理（避免 cold start 双触发）
  },

  onShow() {
    // V10: tab-bar 自己通过 uiStore 同步状态，页面不再手动 setData({selected})
    if (!hasToken()) return;
    const now = Date.now();
    const last = (this as unknown as { _lastLoadAt?: number })._lastLoadAt || 0;
    if (!this.data.breakfast?.length || now - last > 30000) {
      (this as unknown as { _lastLoadAt?: number })._lastLoadAt = now;
      void this.loadAll();
    }
  },

  onUnload() {
    const self = this as unknown as {
      storeBindings?: { destroyStoreBindings: () => void };
      _offHouseholdSwitched?: () => void;
    };
    self.storeBindings?.destroyStoreBindings();
    self._offHouseholdSwitched?.();
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    if (!hasToken()) return;
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
    // 后端 days 以星期名（monday..sunday）为 key，需把选中日期转成星期 key 再取
    const dayKey = weekdayKeyOf(this.data.selectedDate);
    const day = plan.days[dayKey];
    const toDishes = (raw: MealPlanDish[] | undefined): DishItem[] => {
      if (!Array.isArray(raw)) return [];
      return raw.map((d, idx) => ({
        key: d.id ? String(d.id) : `${d.recipe_title || ''}-${idx}`,
        recipeId: d.recipe_id ? String(d.recipe_id) : '',
        title: d.recipe_title || '未命名',
        note: d.note || '',
      }));
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

  onMealAdd(e: WechatMiniprogram.BaseEvent) {
    const slot = (e.currentTarget as unknown as { dataset: { type?: string } }).dataset.type as MealSlotKey | undefined;
    if (!slot || !MEAL_SLOTS.includes(slot)) return;
    // 进入选菜页，通过 events 反向通道接收选中的菜谱
    wx.navigateTo({
      url: `/pages/plan/pick-recipe/index?slot=${slot}&date=${this.data.selectedDate}`,
      events: {
        recipePicked: (payload: { recipe?: Recipe }) => {
          if (payload?.recipe) {
            void this.addDishToSlot(slot, payload.recipe);
          }
        },
      },
    });
  },

  // 把选中的菜谱加入当日指定餐次：
  // 后端 PUT /meal-plans/current 是整周覆盖式保存，必须带回现有 days 再增量追加，避免丢数据
  async addDishToSlot(slot: MealSlotKey, recipe: Recipe) {
    const plan = planStore.plan;
    const dayKey = weekdayKeyOf(this.data.selectedDate);
    const days: Record<string, Record<string, MealPlanDishInput[]>> = {};
    for (const wd of WEEKDAY_KEYS) {
      const slots = plan?.days?.[wd];
      days[wd] = {};
      for (const s of MEAL_SLOTS) {
        days[wd][s] = (slots?.[s] || []).map((d) => ({
          recipe_id: d.recipe_id ? String(d.recipe_id) : undefined,
          recipe_title: d.recipe_title || '',
          note: d.note || '',
        }));
      }
    }
    const target = days[dayKey][slot];
    const recipeId = recipe.id ? String(recipe.id) : undefined;
    // 同餐次去重
    if (recipeId && target.some((d) => d.recipe_id === recipeId)) {
      wx.showToast({ title: `${MEAL_LABEL[slot]}已有这道菜`, icon: 'none' });
      return;
    }
    target.push({ recipe_id: recipeId, recipe_title: recipe.title || '未命名' });
    try {
      await planStore.savePlan(this.data.weekStart, days);
      this.rebuildMeals();
      wx.showToast({ title: `已加入${MEAL_LABEL[slot]}`, icon: 'success' });
    } catch {
      // saveMealPlan 的统一错误 toast 已由 http.ts 处理，本地状态未动无需回滚
    }
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
