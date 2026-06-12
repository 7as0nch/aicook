// 今日推荐页（设计稿 03）
// 入口：拍照识别 → "✨ 生成推荐菜谱" CTA 跳转到本页，url 携带 ingredients=...
// 也可直接进：调 listToday 拿后端推荐
import { recipeApi } from '../../../../services/recipe.api';
import { emojiFor } from '../../../../utils/food-emoji';
import type { Recipe, TodayRecipe } from '../../../../types/api';

interface DisplayRecipe extends Recipe {
  __match: number;       // 匹配度（0-100）；仅 today/食材模式有意义，其余模式不展示
  __meta: string;        // 卡片副标题（只拼真实存在的字段，不造假数据）
}

const SORT_TABS = [
  { key: 'composite', label: '综合排序' },
  { key: 'match', label: '匹配度' },
  { key: 'time', label: '烹饪时间' },
  { key: 'difficulty', label: '难度' },
];

// 难度 1-5 → 文案；缺失返回空串（不显示）
function diffLabel(d?: number): string {
  if (!d) return '';
  if (d <= 2) return '简单';
  if (d === 3) return '中等';
  return '较难';
}

// 卡片副标题：只拼真实字段（proto Recipe 没有 servings，不要造"2人"）
function buildMeta(r: Recipe): string {
  const parts: string[] = [];
  if (r.total_minutes) parts.push(`${r.total_minutes}分钟`);
  const dl = diffLabel(r.difficulty);
  if (dl) parts.push(dl);
  return parts.join(' · ');
}

Page({
  data: {
    ingredients: [] as Array<{ name: string; emoji: string }>,
    extraCount: 0,
    sortTabs: SORT_TABS,
    sortKey: 'composite',
    recipes: [] as DisplayRecipe[],
    loading: true,
    pageTitle: '今日推荐',
    // 收藏/搜索/筛选模式没有推荐评分，隐藏匹配度展示与排序项
    showMatch: true,
  },

  async onLoad(query: { ingredients?: string; keyword?: string; mode?: string }) {
    const csv = (query.ingredients || '').trim();
    const kw = (query.keyword || '').trim();
    const mode = (query.mode || '').trim();
    if (mode === 'favorites') {
      this.setData({ pageTitle: '我的收藏' });
      await this.loadFavorites();
    } else if (mode === 'fast15') {
      this.setData({ pageTitle: '15 分钟快手' });
      await this.loadByFilter({ maxMinutes: 15 });
    } else if (csv) {
      const raw = decodeURIComponent(csv).split(/[,，]/).map(s => s.trim()).filter(Boolean);
      const ingredients = raw.slice(0, 4).map(name => ({ name, emoji: emojiFor(name) }));
      const extraCount = raw.length > 4 ? raw.length - 4 : 0;
      this.setData({ ingredients, extraCount });
      await this.loadByIngredients(raw);
    } else if (kw) {
      const keyword = decodeURIComponent(kw);
      await this.loadByKeyword(keyword);
    } else {
      await this.loadToday();
    }
  },

  // 无评分模式（搜索/收藏/筛选）：隐藏匹配度展示与「匹配度」排序项
  hideMatchUI() {
    this.setData({ showMatch: false, sortTabs: SORT_TABS.filter(t => t.key !== 'match') });
  },

  async loadByKeyword(keyword: string) {
    this.hideMatchUI();
    this.setData({ loading: true });
    try {
      const res = await recipeApi.list({ limit: 30, keyword });
      const recipes: DisplayRecipe[] = (res.recipes || []).map(r => ({ ...r, __match: 0, __meta: buildMeta(r) }));
      this.setData({ recipes });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadFavorites() {
    this.hideMatchUI();
    this.setData({ loading: true });
    try {
      const res = await recipeApi.listFavorites({ limit: 50 });
      const recipes: DisplayRecipe[] = (res.recipes || []).map(r => ({ ...r, __match: 0, __meta: buildMeta(r), favored: true }));
      this.setData({ recipes });
    } catch (e) {
      console.error('[today] load favorites fail', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadByFilter(filter: { maxMinutes?: number }) {
    this.hideMatchUI();
    this.setData({ loading: true });
    try {
      const res = await recipeApi.list({ limit: 50 });
      let recipes: DisplayRecipe[] = (res.recipes || []).map(r => ({ ...r, __match: 0, __meta: buildMeta(r) }));
      if (filter.maxMinutes !== undefined) {
        const max = filter.maxMinutes;
        recipes = recipes.filter(r => !r.total_minutes || r.total_minutes <= max);
      }
      this.setData({ recipes });
    } catch (e) {
      console.error('[today] load by filter fail', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadByIngredients(names: string[]) {
    this.setData({ loading: true });
    try {
      const keyword = names.join(' ');
      const res = await recipeApi.list({ limit: 20, keyword });
      // 客户端按命中关键词数量估算匹配度
      const recipes: DisplayRecipe[] = (res.recipes || []).map(r => {
        const hay = `${r.title || ''} ${(r.scenario_tags || []).join(' ')} ${(r.flavor_tags || []).join(' ')}`.toLowerCase();
        let hits = 0;
        for (const n of names) if (hay.includes(n.toLowerCase())) hits++;
        const matchPct = names.length > 0 ? Math.round((hits / names.length) * 100) : 80;
        return { ...r, __match: Math.min(99, Math.max(50, matchPct)), __meta: buildMeta(r) };
      });
      // 默认按综合排序：score 已无；用 __match 降序作为初始排序
      recipes.sort((a, b) => b.__match - a.__match);
      this.setData({ recipes });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadToday() {
    this.setData({ loading: true });
    try {
      const res = await recipeApi.listToday(30);
      const recipes: DisplayRecipe[] = (res.items || []).map((it: TodayRecipe) => ({
        ...it.recipe,
        __match: Math.round((it.score || 0) * 100),
        __meta: buildMeta(it.recipe),
      }));
      this.setData({ recipes });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.switchTab({ url: '/pages/home/index/index' }));
  },

  onCardTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (id) wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onSortTabTap(e: WechatMiniprogram.BaseEvent) {
    const key = (e.currentTarget as unknown as { dataset: { key: string } }).dataset.key;
    if (!key) return;
    this.applySort(key);
  },

  applySort(key: string) {
    const sorted = [...this.data.recipes];
    if (key === 'match') {
      sorted.sort((a, b) => b.__match - a.__match);
    } else if (key === 'time') {
      sorted.sort((a, b) => (a.total_minutes || 99) - (b.total_minutes || 99));
    } else if (key === 'difficulty') {
      sorted.sort((a, b) => (a.difficulty || 9) - (b.difficulty || 9));
    } else {
      sorted.sort((a, b) => b.__match - a.__match);
    }
    this.setData({ sortKey: key, recipes: sorted });
  },

  onRecipeTap(e: WechatMiniprogram.CustomEvent<{ recipe: Recipe }>) {
    const id = e.detail?.recipe?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },
});
