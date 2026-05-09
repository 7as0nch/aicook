// 我的（Tab 4）
// 设计稿：用户头像 + 等级 / 打卡 + 菜单列表
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { authStore } from '../../../store/auth.store';

type StoreBindings = ReturnType<typeof createStoreBindings>;

interface MenuItem { id: string; iconFallback: string; iconSrc: string; text: string; url: string; }

interface PageThis {
  storeBindings?: StoreBindings;
}

Page({
  data: {
    user: null as unknown,
    currentHousehold: null as unknown,
    level: 6,
    streakWeeks: 12,
    menus: [
      { id: 'profile', iconFallback: '👤', iconSrc: '', text: '个人资料', url: '/pages/me/profile/index' },
      { id: 'households', iconFallback: '🏡', iconSrc: '', text: '家庭管理', url: '/pages/me/households/index' },
      { id: 'preferences', iconFallback: '🌶️', iconSrc: '', text: '口味偏好', url: '/pages/me/preferences/index' },
      { id: 'history', iconFallback: '📜', iconSrc: '', text: '烹饪历史', url: '/pages/me/profile/index' },
      { id: 'fav', iconFallback: '⭐', iconSrc: '', text: '收藏菜谱', url: '/pages/recipes/list/index' },
    ] as MenuItem[],
  },

  onLoad(this: PageThis) {
    this.storeBindings = createStoreBindings(this, {
      store: authStore,
      fields: ['user', 'currentHousehold'] as const,
      actions: [] as const,
    });
  },

  onUnload(this: PageThis) {
    this.storeBindings?.destroyStoreBindings();
  },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 3 });
  },

  onMenuTap(e: WechatMiniprogram.BaseEvent) {
    const url = (e.currentTarget as unknown as { dataset: { url: string } }).dataset.url;
    if (url.startsWith('/pages/recipes/list')) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  onLogoutTap() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          authStore.logout();
          wx.reLaunch({ url: '/pages/auth/login/index' });
        }
      },
    });
  },
});
