// 首页（Tab 1）
// 设计稿要素：搜索栏 + 今日推荐大卡 + 4 快捷入口 + 猜你喜欢横向
// 阶段 0：占位数据；阶段 2 接入 ListTodayRecipes / ListRecipes
import { authStore } from '../../../store/auth.store';

interface QuickEntry {
  id: string;
  iconSrc: string;
  iconFallback: string;
  text: string;
  url: string;
}

interface RecipeCardData {
  id: string;
  title: string;
  cover: string;        // 图片 URL（占位空字符串则显示 emoji）
  coverFallback: string;
  minutes: number;
  servings: string;     // "2-3人"
  matchPercent: number;
  tags: string[];       // ["家常菜", "下饭菜"]
}

Page({
  data: {
    greeting: '欢迎来到馋猫厨房',
    todayRecipe: {
      id: 'demo',
      title: '番茄土豆炖牛腩',
      cover: '',
      coverFallback: '🍲',
      minutes: 30,
      servings: '2-3人',
      matchPercent: 99,
      tags: ['家常菜'],
    } as RecipeCardData,
    quickEntries: [
      { id: 'recipes', iconSrc: '', iconFallback: '📖', text: '菜谱推荐', url: '/pages/recipes/list/index' },
      { id: 'snap', iconSrc: '', iconFallback: '📷', text: '冰箱识别', url: '/pages/recipes/snap/index' },
      { id: 'plan', iconSrc: '', iconFallback: '🗓️', text: '计划做菜', url: '/pages/plan/index/index' },
      { id: 'ai', iconSrc: '', iconFallback: '🐱', text: 'AI 助理', url: 'ai-open' },
    ] as QuickEntry[],
    suggested: [
      { id: 'a', title: '清炒四季豆', cover: '', coverFallback: '🥬', minutes: 15, servings: '2人', matchPercent: 99, tags: ['家常菜'] },
      { id: 'b', title: '番茄炒蛋', cover: '', coverFallback: '🍳', minutes: 15, servings: '2人', matchPercent: 99, tags: ['家常菜'] },
    ] as RecipeCardData[],
  },

  onShow() {
    // 同步 tabBar 选中态
    const tabBar = this.getTabBar?.();
    if (tabBar) {
      tabBar.setData({ selected: 0 });
    }
    const user = authStore.user;
    this.setData({
      greeting: user ? `你好，${user.display_name || user.username}` : '欢迎来到馋猫厨房',
    });
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/recipes/list/index' });
  },

  onTodayRecipeTap() {
    const id = this.data.todayRecipe.id;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onCookNowTap() {
    const id = this.data.todayRecipe.id;
    wx.navigateTo({ url: `/pages/recipes/cooking/index?id=${id}` });
  },

  onQuickTap(e: WechatMiniprogram.BaseEvent) {
    const url = (e.currentTarget as unknown as { dataset: { url: string } }).dataset.url;
    if (url === 'ai-open') {
      // 触发 AI 抽屉
      const { emit, EVENTS } = require('../../../utils/eventbus');
      emit(EVENTS.AI_OPEN);
      return;
    }
    if (url.startsWith('/pages/recipes/list') || url.startsWith('/pages/plan/')) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  onSuggestedTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },
});
