// 计划页（Tab 3）
// 设计稿：本周日历（7 天）+ 今日计划三餐 + AI 生成 CTA
interface DayCell { date: number; weekday: string; isToday: boolean; }
interface Meal { id: string; type: 'breakfast' | 'lunch' | 'dinner'; iconFallback: string; label: string; recipes: MealRecipe[]; }
interface MealRecipe { id: string; title: string; cover: string; coverFallback: string; minutes: number; tag?: string; }

Page({
  data: {
    weekRange: '2026-05-04 ~ 2026-05-10',
    days: [
      { date: 4, weekday: '一', isToday: false },
      { date: 5, weekday: '二', isToday: false },
      { date: 6, weekday: '三', isToday: false },
      { date: 7, weekday: '四', isToday: true },
      { date: 8, weekday: '五', isToday: false },
      { date: 9, weekday: '六', isToday: false },
      { date: 10, weekday: '日', isToday: false },
    ] as DayCell[],
    todayLabel: '今日计划',
    todaySummary: '3 餐 · 8 道菜',
    meals: [
      { id: 'b', type: 'breakfast', iconFallback: '🌅', label: '早餐', recipes: [
        { id: 'b1', title: '南瓜小米粥', cover: '', coverFallback: '🍚', minutes: 20, tag: '营养' },
        { id: 'b2', title: '鸡蛋饼', cover: '', coverFallback: '🥞', minutes: 15, tag: '快手' },
      ]},
      { id: 'l', type: 'lunch', iconFallback: '☀️', label: '午餐', recipes: [
        { id: 'l1', title: '番茄土豆炖牛腩', cover: '', coverFallback: '🍲', minutes: 40, tag: '荤菜' },
        { id: 'l2', title: '清炒西兰花', cover: '', coverFallback: '🥦', minutes: 10, tag: '清淡' },
        { id: 'l3', title: '米饭', cover: '', coverFallback: '🍚', minutes: 20, tag: '碳水' },
      ]},
      { id: 'd', type: 'dinner', iconFallback: '🌙', label: '晚餐', recipes: [
        { id: 'd1', title: '虾仁蒸蛋', cover: '', coverFallback: '🍳', minutes: 15, tag: '鲜美' },
        { id: 'd2', title: '凉拌黄瓜', cover: '', coverFallback: '🥒', minutes: 10, tag: '清爽' },
        { id: 'd3', title: '紫菜汤', cover: '', coverFallback: '🍵', minutes: 10, tag: '汤品' },
      ]},
    ] as Meal[],
  },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 2 });
  },

  onDayTap(e: WechatMiniprogram.BaseEvent) {
    const date = (e.currentTarget as unknown as { dataset: { date: number } }).dataset.date;
    console.log('[plan] day', date);
  },

  onRecipeTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onShoppingTap() {
    wx.navigateTo({ url: '/pages/plan/shopping/index' });
  },

  onAIGenerateTap() {
    wx.showLoading({ title: 'AI 生成中…' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '阶段 5 接入', icon: 'none' });
    }, 800);
  },
});
