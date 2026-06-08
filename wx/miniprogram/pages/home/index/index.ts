// 首页 - Tab 1（aicook 2.0 Figma 重构）
// 设计稿：顶部 logo + 搜索 / 今日推荐 hero / 4 快捷入口 / 灵感推荐 chips + 双列网格
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { authStore } from '../../../store/auth.store';
import { householdStore } from '../../../store/household.store';
import { recipeApi } from '../../../services/recipe.api';
import { emit, EVENTS } from '../../../utils/eventbus';
import type { Recipe, TodayRecipe } from '../../../types/api';

interface QuickEntry {
  id: string;
  emoji: string;
  iconSrc: string;
  text: string;
  theme: 'orange' | 'green' | 'blue' | 'gray';
  url?: string;       // 路由路径
  switchTab?: boolean;
  aiOpen?: boolean;
}

const FALLBACK_CHIPS = ['为你推荐', '家常菜', '快手菜', '低卡', '素食'];

Page({
  data: {
    greeting: '',
    todayRecipe: null as Recipe | null,
    todayMatch: 0,
    quickEntries: [
      { id: 'snap', emoji: '📷', iconSrc: '', text: '拍照识别', theme: 'orange', url: '/pages/recipes/snap/index' },
      { id: 'inventory', emoji: '🧊', iconSrc: '', text: '冰箱优先', theme: 'green', url: '/pages/me/inventory/index/index' },
      { id: 'fast15', emoji: '⏱️', iconSrc: '', text: '15分钟快手', theme: 'orange', url: '/pages/recipes/today/index/index?mode=fast15', switchTab: false },
      { id: 'favorites', emoji: '⭐', iconSrc: '', text: '我的收藏', theme: 'green', url: '/pages/recipes/today/index/index?mode=favorites', switchTab: false },
    ] as QuickEntry[],
    user: null as unknown,
    chips: FALLBACK_CHIPS,
    activeChip: '为你推荐',
    searchKeyword: '',
    suggested: [] as Recipe[],
    loading: false,
  },

  onLoad() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings = createStoreBindings(this, {
      store: authStore,
      fields: ['user'],
      actions: [],
    });
    void this.loadAll();
  },

  onUnload() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings?.destroyStoreBindings();
  },

  onShow() {
    const tabBar = this.getTabBar?.();
    if (tabBar) tabBar.setData({ selected: 0 });
    const user = authStore.user;
    this.setData({
      greeting: user ? `你好，${user.display_name || user.username}` : '欢迎来到馋猫厨房',
    });
    // 首次有缓存则跳过；30s 内不重复拉取；切 household 后会通过事件主动刷新
    const now = Date.now();
    const last = (this as unknown as { _lastLoadAt?: number })._lastLoadAt || 0;
    if (this.data.suggested.length === 0 || now - last > 30000) {
      // 推迟到下一帧执行，避免阻塞页面切换动画
      setTimeout(() => {
        (this as unknown as { _lastLoadAt?: number })._lastLoadAt = Date.now();
        void this.loadAll();
      }, 0);
    }
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      // 并行拉取今日推荐 + 灵感推荐 + chip 标签
      const [todayRes, listRes] = await Promise.all([
        recipeApi.listToday(1).catch(() => ({ items: [] as TodayRecipe[] })),
        recipeApi.list({ limit: 6 }).catch(() => ({ recipes: [] as Recipe[] })),
      ]);
      const todayItem = todayRes.items?.[0];
      this.setData({
        todayRecipe: todayItem?.recipe || null,
        todayMatch: todayItem?.score ? Math.round(todayItem.score * 100) : 0,
        suggested: listRes.recipes || [],
      });
      // 标签 chip：尝试用 householdStore 的 tags
      try {
        if (!householdStore.tags?.length) {
          await householdStore.loadTags();
        }
        if (householdStore.tags?.length) {
          const names = householdStore.tags.map(t => t.name).slice(0, 5);
          this.setData({ chips: ['为你推荐', ...names] });
        }
      } catch {
        // 失败保留兜底
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearchConfirm() {
    const kw = (this.data.searchKeyword || '').trim();
    if (!kw) {
      wx.switchTab({ url: '/pages/recipes/list/index' });
      return;
    }
    wx.navigateTo({ url: `/pages/recipes/today/index/index?keyword=${encodeURIComponent(kw)}` });
  },

  onSearchTap() {
    wx.switchTab({ url: '/pages/recipes/list/index' });
  },

  onScanTap() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const result = (res.result || '').trim();
        if (!result) return;
        // 后端约定：分享码格式 aicook://share/<code> 或纯 share_code
        let code = result;
        const m = result.match(/share\/([^/?#]+)/);
        if (m) code = m[1];
        if (code) {
          wx.navigateTo({ url: `/pages/recipes/share-import/index?code=${encodeURIComponent(code)}` });
        }
      },
      fail: () => {
        // 用户取消或失败，不报错
      },
    });
  },

  onSettingsTap() {
    wx.switchTab({ url: '/pages/me/index/index' });
  },

  onAvatarTap() {
    wx.switchTab({ url: '/pages/me/index/index' });
  },

  onTodayRecipeTap() {
    if (!this.data.todayRecipe?.id) return;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${this.data.todayRecipe.id}` });
  },

  onQuickTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    const entry = this.data.quickEntries.find(x => x.id === id);
    if (!entry) return;
    if (entry.aiOpen) {
      emit(EVENTS.AI_OPEN);
      return;
    }
    if (entry.url) {
      if (entry.switchTab) wx.switchTab({ url: entry.url });
      else wx.navigateTo({ url: entry.url });
    }
  },

  onChipTap(e: WechatMiniprogram.BaseEvent) {
    const name = (e.currentTarget as unknown as { dataset: { name: string } }).dataset.name;
    this.setData({ activeChip: name });
    // 真实业务可基于 activeChip 重新请求；MVP 不再请求，保持当前列表
  },

  onSuggestedCardTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (id) wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  async onSuggestedFavoriteTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (!id) return;
    const target = this.data.suggested.find(r => String(r.id) === String(id));
    if (!target) return;
    try {
      if (target.favored) {
        await recipeApi.removeFavorite(target.id);
        target.favored = false;
      } else {
        await recipeApi.addFavorite(target.id);
        target.favored = true;
      }
      this.setData({ suggested: this.data.suggested.map(r => r.id === target.id ? { ...r, favored: target.favored } : r) });
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onSuggestedTap(e: WechatMiniprogram.CustomEvent<{ recipe: Recipe }>) {
    const recipe = e.detail?.recipe;
    if (!recipe?.id) return;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${recipe.id}` });
  },

  async onSuggestedFavorite(e: WechatMiniprogram.CustomEvent<{ recipe: Recipe }>) {
    const recipe = e.detail?.recipe;
    if (!recipe?.id) return;
    try {
      if (recipe.favored) {
        await recipeApi.removeFavorite(recipe.id);
        recipe.favored = false;
      } else {
        await recipeApi.addFavorite(recipe.id);
        recipe.favored = true;
      }
      // 触发更新
      const suggested = this.data.suggested.map(r => r.id === recipe.id ? { ...r, favored: recipe.favored } : r);
      this.setData({ suggested });
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onTodayRecipeView() {
    this.onTodayRecipeTap();
  },
});
