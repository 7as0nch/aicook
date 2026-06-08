// 今日推荐页（设计稿 03）
// 入口：拍照识别 → "✨ 生成推荐菜谱" CTA 跳转到本页，url 携带 ingredients=...
// 也可直接进：调 listToday 拿后端推荐
import { recipeApi } from '../../../../services/recipe.api';
import type { Recipe, TodayRecipe } from '../../../../types/api';

interface DisplayRecipe extends Recipe {
  __match: number;
}

const EMOJI_MAP: Record<string, string> = {
  '番茄': '🍅', '西红柿': '🍅',
  '土豆': '🥔',
  '青椒': '🌶️',
  '鸡蛋': '🥚',
  '玉米': '🌽',
  '生菜': '🥬', '青菜': '🥬',
  '五花肉': '🥩', '牛腩': '🥩',
  '小葱': '🌿', '葱': '🌿',
};

function emojiFor(name: string): string {
  for (const k of Object.keys(EMOJI_MAP)) {
    if (name.includes(k)) return EMOJI_MAP[k];
  }
  return '🥗';
}

const SORT_TABS = [
  { key: 'composite', label: '综合排序' },
  { key: 'match', label: '匹配度' },
  { key: 'time', label: '烹饪时间' },
  { key: 'difficulty', label: '难度' },
];

Page({
  data: {
    ingredients: [] as Array<{ name: string; emoji: string }>,
    extraCount: 0,
    sortTabs: SORT_TABS,
    sortKey: 'composite',
    recipes: [] as DisplayRecipe[],
    loading: true,
    pageTitle: '今日推荐',
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

  async loadByKeyword(keyword: string) {
    this.setData({ loading: true });
    try {
      const res = await recipeApi.list({ limit: 30, keyword, exclude_draft: true });
      const recipes: DisplayRecipe[] = (res.recipes || []).map(r => ({ ...r, __match: 90 }));
      this.setData({ recipes });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadFavorites() {
    this.setData({ loading: true });
    try {
      const res = await recipeApi.listFavorites({ limit: 50 });
      const recipes: DisplayRecipe[] = (res.recipes || []).map(r => ({ ...r, __match: 100, favored: true }));
      this.setData({ recipes });
    } catch (e) {
      console.error('[today] load favorites fail', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadByFilter(filter: { maxMinutes?: number }) {
    this.setData({ loading: true });
    try {
      const res = await recipeApi.list({ limit: 50, exclude_draft: true });
      let recipes: DisplayRecipe[] = (res.recipes || []).map(r => ({ ...r, __match: 90 }));
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
      const res = await recipeApi.list({ limit: 20, keyword, exclude_draft: true });
      // 客户端按命中关键词数量估算匹配度
      const recipes: DisplayRecipe[] = (res.recipes || []).map(r => {
        const hay = `${r.title || ''} ${(r.scenario_tags || []).join(' ')} ${(r.flavor_tags || []).join(' ')}`.toLowerCase();
        let hits = 0;
        for (const n of names) if (hay.includes(n.toLowerCase())) hits++;
        const matchPct = names.length > 0 ? Math.round((hits / names.length) * 100) : 80;
        return { ...r, __match: Math.min(99, Math.max(50, matchPct)) };
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
        __match: Math.round((it.score || 0.9) * 100),
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

  onSortChange(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const key = e.detail?.value;
    if (!key) return;
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
