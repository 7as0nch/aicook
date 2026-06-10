// 菜谱列表（Tab 2）
// 设计稿：搜索 + 标签筛选 + 今日常做 + 按类型浏览网格 + 我的菜谱入口
import { recipeApi } from '../../../services/recipe.api';
import { hasToken } from '../../../utils/auth-guard';
import type { Recipe, TodayRecipe } from '../../../types/api';

interface FilterTag { id: string; text: string; tag?: string; }
interface CategoryCell { id: string; iconSrc: string; text: string; }

Page({
  data: {
    keyword: '',
    activeFilter: 'all',
    filters: [
      { id: 'all', text: '全部' },
      { id: 'home', text: '家常菜', tag: '家常菜' },
      { id: 'quick', text: '快手菜', tag: '快手菜' },
      { id: 'soup', text: '汤羹', tag: '汤羹' },
      { id: 'lite', text: '减脂餐', tag: '减脂餐' },
    ] as FilterTag[],
    todayPicks: [] as Recipe[],
    categories: [
      { id: 'home', iconSrc: '/assets/icons/categories/home.svg', text: '家常菜' },
      { id: 'quick', iconSrc: '/assets/icons/categories/quick.svg', text: '快手菜' },
      { id: 'soup', iconSrc: '/assets/icons/categories/soup.svg', text: '汤羹' },
      { id: 'lite', iconSrc: '/assets/icons/categories/lite.svg', text: '减脂餐' },
      { id: 'baby', iconSrc: '/assets/icons/categories/baby.svg', text: '宝宝餐' },
      { id: 'bake', iconSrc: '/assets/icons/categories/bake.svg', text: '烘焙' },
      { id: 'rice', iconSrc: '/assets/icons/categories/rice.svg', text: '下饭菜' },
      { id: 'more', iconSrc: '/assets/icons/categories/more.svg', text: '更多' },
    ] as CategoryCell[],
    recipes: [] as Recipe[],
    myCounts: {
      total: 0,
      drafts: 0,
      recentDeleted: 0,
    },
    loading: false,
    hasMore: false,
  },

  onShow() {
    // V10: tab-bar 自己通过 uiStore 同步状态，页面不再手动 setData({selected})
    // 未登录早退（app.ts onLaunch 兜底跳登录页）
    if (!hasToken()) return;
    const now = Date.now();
    const last = (this as unknown as { _lastLoadAt?: number })._lastLoadAt || 0;
    if (this.data.todayPicks.length === 0 || now - last > 30000) {
      (this as unknown as { _lastLoadAt?: number })._lastLoadAt = now;
      void this.loadAll();
    }
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    if (!hasToken()) return;
    this.setData({ loading: true });
    try {
      const [todayRes, listRes, favRes] = await Promise.all([
        recipeApi.listToday(2).catch(() => ({ items: [] as TodayRecipe[] })),
        recipeApi.list({ limit: 20, exclude_draft: true }).catch(() => ({ recipes: [] as Recipe[] })),
        recipeApi.listFavorites({ limit: 1 }).catch(() => ({ recipes: [] as Recipe[], total: 0 })),
      ]);
      const picks = (todayRes.items || []).map(it => it.recipe).filter(Boolean) as Recipe[];
      this.setData({
        todayPicks: picks,
        recipes: listRes.recipes || [],
        myCounts: {
          total: Number((favRes as { total?: number | string }).total || 0),
          drafts: 0,
          recentDeleted: 0,
        },
      });
    } catch (e) {
      console.error('[recipes/list] loadAll fail', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  async onSearchConfirm() {
    const keyword = (this.data.keyword || '').trim();
    if (!keyword) return;
    try {
      const res = await recipeApi.list({ keyword, limit: 30 });
      this.setData({ recipes: res.recipes || [] });
    } catch (e) {
      console.error('[recipes/list] search fail', e);
    }
  },

  async onFilterTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    const filter = this.data.filters.find(f => f.id === id);
    if (!filter) return;
    this.setData({ activeFilter: id });
    try {
      const query = id === 'all'
        ? { limit: 30 }
        : { kitchen_tag: filter.tag || '', limit: 30 };
      const res = await recipeApi.list(query);
      this.setData({ recipes: res.recipes || [] });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const cat = (e.currentTarget as unknown as { dataset: { id: string; text: string } }).dataset;
    if (!cat.text) return;
    // 跳今日推荐页，按类别过滤
    wx.navigateTo({ url: `/pages/recipes/today/index/index?keyword=${encodeURIComponent(cat.text)}` });
  },

  onRecipeTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  async onFavoriteTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (!id) return;
    const target = this.data.recipes.find(r => String(r.id) === String(id));
    if (!target) return;
    try {
      if (target.favored) {
        await recipeApi.removeFavorite(target.id);
        target.favored = false;
      } else {
        await recipeApi.addFavorite(target.id);
        target.favored = true;
      }
      this.setData({
        recipes: this.data.recipes.map(r => r.id === target.id ? { ...r, favored: target.favored } : r),
      });
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onFavTap() {
    wx.navigateTo({ url: '/pages/recipes/list/index?creator=fav' });
  },

  onWorkbenchTap() {
    wx.navigateTo({ url: '/pages/recipes/workbench/index' });
  },
});
