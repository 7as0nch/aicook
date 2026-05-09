// 菜谱详情
// 设计稿：大图 + 标签 + 时长/难度/份量 + Tab(简介/食材/步骤/AI 指导) + 开始烹饪 CTA
type DetailTab = 'intro' | 'ingredients' | 'steps' | 'ai';

interface StepRow { no: number; description: string; }

Page({
  data: {
    id: '',
    activeTab: 'steps' as DetailTab,
    recipe: {
      title: '番茄土豆炖牛腩',
      coverFallback: '🍲',
      cover: '',
      minutes: 60,
      difficulty: '中等',
      servings: '2-3人',
      tags: ['家常菜'],
      matchPercent: 99,
    },
    introText: '番茄酸甜开胃，牛腩软烂入味，汤汁浓郁下饭，家常必备。',
    ingredients: [
      { id: 'i1', name: '牛腩', amount: '500g' },
      { id: 'i2', name: '土豆', amount: '2 个' },
      { id: 'i3', name: '番茄', amount: '3 个' },
      { id: 'i4', name: '生姜', amount: '1 块' },
    ],
    steps: [
      { no: 1, description: '牛腩切块，冷水下锅焯水，去除血沫后捞出。' },
      { no: 2, description: '热锅冷油，放入葱姜蒜、八角、桂皮炒香。' },
      { no: 3, description: '加入牛腩翻炒，倒入生抽、料酒上色。' },
      { no: 4, description: '加入番茄块翻炒出汁，再加入土豆块。' },
    ] as StepRow[],
    aiHints: ['火候建议：中火慢炖 40 分钟', '替代方案：缺番茄可用番茄酱', '营养：高蛋白 / 中等热量'],
  },

  onLoad(query: Record<string, string>) {
    this.setData({ id: query.id || '' });
  },

  onTabSwitch(e: WechatMiniprogram.BaseEvent) {
    const tab = (e.currentTarget as unknown as { dataset: { tab: DetailTab } }).dataset.tab;
    this.setData({ activeTab: tab });
  },

  onCookTap() {
    wx.navigateTo({ url: `/pages/recipes/cooking/index?id=${this.data.id}` });
  },

  onFavTap() {
    wx.showToast({ title: '已收藏', icon: 'success' });
  },

  onShareTap() {
    wx.showToast({ title: '阶段 9 实现分享', icon: 'none' });
  },
});
