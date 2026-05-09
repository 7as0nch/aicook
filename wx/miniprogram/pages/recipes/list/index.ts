// 菜谱列表（Tab 2）
// 设计稿：搜索 + 标签筛选 + 今日常做 + 按类型浏览网格 + 我的菜谱入口
interface FilterTag { id: string; text: string; }
interface CategoryCell { id: string; iconSrc: string; iconFallback: string; text: string; }
interface RecipeItem { id: string; title: string; cover: string; coverFallback: string; minutes: number; difficulty: string; favorites?: number; }

Page({
  data: {
    keyword: '',
    activeFilter: 'all',
    filters: [
      { id: 'all', text: '全部' },
      { id: 'home', text: '家常菜' },
      { id: 'quick', text: '快手菜' },
      { id: 'soup', text: '汤羹' },
      { id: 'lite', text: '减脂餐' },
    ] as FilterTag[],
    todayPicks: [
      { id: 'a', title: '番茄土豆炖牛腩', cover: '', coverFallback: '🍲', minutes: 60, difficulty: '中等', favorites: 1200 },
      { id: 'b', title: '青椒炒鸡蛋', cover: '', coverFallback: '🥚', minutes: 15, difficulty: '简单', favorites: 986 },
    ] as RecipeItem[],
    categories: [
      { id: 'home', iconSrc: '', iconFallback: '🍱', text: '家常菜' },
      { id: 'quick', iconSrc: '', iconFallback: '⏱️', text: '快手菜' },
      { id: 'soup', iconSrc: '', iconFallback: '🍲', text: '汤羹' },
      { id: 'lite', iconSrc: '', iconFallback: '🥗', text: '减脂餐' },
      { id: 'baby', iconSrc: '', iconFallback: '🍼', text: '宝宝餐' },
      { id: 'bake', iconSrc: '', iconFallback: '🍰', text: '烘焙' },
      { id: 'rice', iconSrc: '', iconFallback: '🍚', text: '下饭菜' },
      { id: 'more', iconSrc: '', iconFallback: '⋯', text: '更多' },
    ] as CategoryCell[],
    myCounts: {
      total: 86,
      drafts: 4,
      recentDeleted: 2,
    },
  },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 1 });
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onFilterTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    this.setData({ activeFilter: id });
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    console.log('[recipes] category', id);
  },

  onRecipeTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },
});
