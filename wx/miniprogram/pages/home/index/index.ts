// 首页 - Tab 1（aicook 2.0 Figma 重构）
// 设计稿：顶部 logo + 搜索 / 今日推荐 hero / 4 快捷入口 / 灵感推荐 chips + 双列网格
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { authStore } from '../../../store/auth.store';
import { householdStore } from '../../../store/household.store';
import { recipeApi } from '../../../services/recipe.api';
import { chatStore } from '../../../store/chat.store';
import { uiStore } from '../../../store/ui.store';
import { hasToken } from '../../../utils/auth-guard';
import { on, EVENTS } from '../../../utils/eventbus';
import { recipeMetaLabel } from '../../../utils/format';
import { stableMediaURL } from '../../../utils/media-cache';
import type { Recipe, TodayRecipe } from '../../../types/api';

// 灵感推荐卡片的展示模型（__meta 只拼真实字段，不造假数据）
type SuggestedRecipe = Recipe & { __meta: string };

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
    todayReason: '',
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
    suggested: [] as SuggestedRecipe[],
    // 按类型浏览（家庭 KitchenTag），点选后跳菜谱 Tab 预选
    categories: [] as Array<{ id: string; name: string }>,
    loading: false,
  },

  onLoad() {
    const self = this as unknown as {
      storeBindings?: { destroyStoreBindings: () => void };
      _offHouseholdSwitched?: () => void;
      _lastLoadAt?: number;
    };
    self.storeBindings = createStoreBindings(this, {
      store: authStore,
      fields: ['user'],
      actions: [],
    });
    // 切家庭后推荐数据属于新家庭：失效缓存戳，下次 onShow 立即重新拉取。
    // 不主动 loadAll，避免后台页面多发请求（当前切换流程会 reLaunch，这里是防御性兜底）。
    self._offHouseholdSwitched = on(EVENTS.HOUSEHOLD_SWITCHED, () => {
      self._lastLoadAt = 0;
    });
    // 不在这里调 loadAll：onShow 紧接着会跑（且更适合 tabbar 切换场景的刷新策略）
  },

  onUnload() {
    const self = this as unknown as {
      storeBindings?: { destroyStoreBindings: () => void };
      _offHouseholdSwitched?: () => void;
    };
    self.storeBindings?.destroyStoreBindings();
    self._offHouseholdSwitched?.();
  },

  onShow() {
    // 每个 tab 页 onShow 主动同步底部高亮：代码 wx.switchTab（如首页点类目）不经过 tab-bar 自身点击
    uiStore.setTabSelected(0);
    // 未登录早退：app.ts 已经在 onLaunch reLaunch 到登录页；
    // 这里再加一道防线，避免任何来路把首页带起来时还发请求。
    if (!hasToken()) return;
    const user = authStore.user;
    this.setData({
      greeting: user ? `你好，${user.display_name || user.username}` : '欢迎来到萝卜爱做饭',
    });
    // 首次有缓存则跳过；30s 内不重复拉取；切 household 后事件回调已把 _lastLoadAt 置 0，此处会立即刷新
    const now = Date.now();
    const last = (this as unknown as { _lastLoadAt?: number })._lastLoadAt || 0;
    if (this.data.suggested.length === 0 || now - last > 30000) {
      (this as unknown as { _lastLoadAt?: number })._lastLoadAt = now;
      void this.loadAll();
    }
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    // 数据加载入口再做一次同步守卫，避免被 onShow 之外的路径（事件回调等）误触发
    if (!hasToken()) return;
    this.setData({ loading: true });
    try {
      // 今日推荐 + 灵感推荐同源于个性化排序 ListToday（偏好/计划/最近做过加权）：
      // 第 1 道作头条「今日推荐」，其余作「为你推荐」网格；ListToday 已签名封面并注入收藏态。
      const todayRes = await recipeApi.listToday(7).catch(() => ({ items: [] as TodayRecipe[] }));
      const items = todayRes.items || [];
      const todayItem = items[0];
      const today = todayItem?.recipe || null;
      const gridRecipes = items.slice(1).map(i => i.recipe).filter(Boolean) as Recipe[];
      this.setData({
        // 封面过签名缓存，避免每次进首页重下
        todayRecipe: today ? { ...today, cover_image_url: stableMediaURL(today.cover_image_url || '') } : null,
        // 不再展示「匹配百分比」：后端 score 是内部排序分而非匹配度，按「不展示虚构数据」约定只显示真实理由
        todayReason: todayItem?.reasons?.[0]?.label || '',
        // 重载即回到「为你推荐」个性化态，避免网格与高亮 chip 不一致
        activeChip: '为你推荐',
        suggested: gridRecipes.map(r => ({ ...r, cover_image_url: stableMediaURL(r.cover_image_url || ''), __meta: recipeMetaLabel(r) })),
      });
      // 标签 chip：尝试用 householdStore 的 tags
      try {
        if (!householdStore.tags?.length) {
          await householdStore.loadTags();
        }
        if (householdStore.tags?.length) {
          const names = householdStore.tags.map(t => t.name).slice(0, 5);
          this.setData({
            chips: ['为你推荐', ...names],
            categories: householdStore.tags.map(t => ({ id: String(t.id), name: t.name })),
          });
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

  // 首页"按类型浏览"：暂存类目 + 跳菜谱 Tab（switchTab 不能带参，菜谱页 onShow 读取）
  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const name = String((e.currentTarget as unknown as { dataset: { name: string } }).dataset.name || '');
    if (!name) return;
    householdStore.setPendingCategory(name);
    wx.switchTab({ url: '/pages/recipes/list/index' });
  },

  onQuickTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    const entry = this.data.quickEntries.find(x => x.id === id);
    if (!entry) return;
    if (entry.aiOpen) {
      chatStore.openSheet({ scene: 'chat' });
      return;
    }
    if (entry.url) {
      if (entry.switchTab) wx.switchTab({ url: entry.url });
      else wx.navigateTo({ url: entry.url });
    }
  },

  async onChipTap(e: WechatMiniprogram.BaseEvent) {
    const name = (e.currentTarget as unknown as { dataset: { name: string } }).dataset.name;
    if (!name || name === this.data.activeChip) return;
    this.setData({ activeChip: name, loading: true });
    try {
      let recipes: Recipe[];
      if (name === '为你推荐') {
        // 个性化：与今日推荐同源（ListToday），取排序靠前的几道，去掉已在头条的那道
        const res = await recipeApi.listToday(7);
        const heroId = String(this.data.todayRecipe?.id || '');
        recipes = ((res.items || []).map(i => i.recipe).filter(Boolean) as Recipe[])
          .filter(r => String(r.id) !== heroId)
          .slice(0, 6);
      } else {
        // 具体类目：按 kitchen_tag 取该类目下的已发布菜谱
        const res = await recipeApi.list({ limit: 6, kitchen_tag: name, recipe_status: 'published' });
        recipes = res.recipes || [];
      }
      this.setData({
        suggested: recipes.map(r => ({ ...r, cover_image_url: stableMediaURL(r.cover_image_url || ''), __meta: recipeMetaLabel(r) })),
      });
    } catch {
      // http.ts 已统一 toast，保持当前列表
    } finally {
      this.setData({ loading: false });
    }
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

  onTodayRecipeView() {
    this.onTodayRecipeTap();
  },
});
