// 我的页（设计稿 07）
// 头像 + ID + 3 列数据 + 温馨小厨房卡 + 家庭口味区 + 菜单
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { authStore } from '../../../store/auth.store';
import { uiStore } from '../../../store/ui.store';
import { recipeApi } from '../../../services/recipe.api';
import { kitchenApi } from '../../../services/kitchen.api';
import { householdApi } from '../../../services/household.api';
import { hasToken } from '../../../utils/auth-guard';
import { computeStreakDays } from '../../../utils/time';
import type { CookingHistoryEntry, HouseholdMemberDetail } from '../../../types/api';

interface MenuItem { id: string; emoji: string; text: string; url: string; }

const MEMBER_EMOJI = ['🐱', '😺', '👵', '👴', '👶', '👩‍🍳', '👨‍🍳'];

interface MemberRow {
  id: string;
  emoji: string;
  name: string;
  tags: string[];
}

Page({
  data: {
    user: null as unknown,
    currentHousehold: null as unknown,
    households: [] as unknown,
    favoritesCount: 0,
    myRecipesCount: 0,
    streakDays: 0,
    // 首次加载统计前显示骨架，避免闪 0
    statsLoading: true,
    members: [] as MemberRow[],
    // 旧版菜单已 inline 到 wxml；保留空数组防止 storeBindings / wxml 误引用
    menus: [] as MenuItem[],
  },

  onLoad() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings = createStoreBindings(this, {
      store: authStore,
      fields: ['user', 'currentHousehold', 'households'] as const,
      actions: [] as const,
    });
    // onLoad 不发请求；交给 onShow 在登录态确认后再 load
  },

  onShow() {
    uiStore.setTabSelected(3);
    if (!hasToken()) return;
    // 若 store 已有 user，但 wxml 渲染需要从 setData 触发，主动 refresh
    if (!authStore.user) {
      authStore.refreshMe().catch(() => undefined);
    }
    const now = Date.now();
    const last = (this as unknown as { _lastStatsAt?: number })._lastStatsAt || 0;
    if ((this.data.favoritesCount === 0 && this.data.myRecipesCount === 0) || now - last > 30000) {
      (this as unknown as { _lastStatsAt?: number })._lastStatsAt = now;
      void this.loadStats();
    }
    const lastMembers = (this as unknown as { _lastMembersAt?: number })._lastMembersAt || 0;
    if (this.data.members.length === 0 || now - lastMembers > 30000) {
      (this as unknown as { _lastMembersAt?: number })._lastMembersAt = now;
      this.refreshMembers();
    }
  },

  onUnload() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings?.destroyStoreBindings();
  },

  async loadStats() {
    if (!hasToken()) return;
    // 三个 API 单独 try/catch，任何失败都不影响其它数据
    let favCount = 0;
    let myCount = 0;
    let streak = 0;
    try {
      const favRes = await recipeApi.listFavorites({ limit: 1 });
      favCount = Number((favRes as { total?: number | string }).total || 0);
    } catch (e) { /* ignore */ }
    try {
      const minesRes = await recipeApi.list({ limit: 100 });
      myCount = (minesRes.recipes || []).length;
    } catch (e) { /* ignore */ }
    try {
      const historyRes = await kitchenApi.listRecentCookingHistory(30);
      const entries = (historyRes as { entries?: CookingHistoryEntry[] }).entries || [];
      streak = computeStreakDays(entries.map((it) => it.completed_at || it.started_at));
    } catch (e) { /* ignore */ }
    this.setData({
      favoritesCount: favCount,
      myRecipesCount: myCount,
      streakDays: streak,
      statsLoading: false,
    });
  },

  async refreshMembers() {
    if (!hasToken()) return;
    const household = authStore.currentHousehold as { id?: string | number; name?: string } | null;
    if (!household?.id) {
      this.setData({ members: [] });
      return;
    }
    try {
      const res = await householdApi.listMembers(household.id);
      const list = (res.members || []).map((m: HouseholdMemberDetail, i: number): MemberRow => ({
        id: String(m.id),
        emoji: m.emoji || MEMBER_EMOJI[i % MEMBER_EMOJI.length],
        name: m.display_name || `成员${i + 1}`,
        tags: m.flavor_tags || [],
      }));
      this.setData({ members: list });
    } catch (e) {
      this.setData({
        members: [{ id: '1', emoji: '🐱', name: '我', tags: ['默认管理员'] }],
      });
    }
  },

  onAvatarTap() {
    wx.navigateTo({ url: '/pages/me/profile/index' });
  },

  onStatFavTap() {
    wx.navigateTo({ url: '/pages/recipes/list/index?creator=fav' });
  },

  onStatMineTap() {
    wx.navigateTo({ url: '/pages/recipes/list/index?creator=me' });
  },

  onStatStreakTap() {
    wx.navigateTo({ url: '/pages/me/history/index/index' });
  },

  onHouseholdTap() {
    wx.navigateTo({ url: '/pages/me/households/index' });
  },

  // 复制用户 ID 到剪贴板
  onCopyId() {
    const username = (authStore.user as { username?: string } | null)?.username;
    if (!username) return;
    wx.setClipboardData({
      data: username,
      success: () => {
        wx.showToast({ title: '已复制 ID', icon: 'success' });
      },
    });
  },

  onPreferencesTap() {
    wx.navigateTo({ url: '/pages/me/preferences/index' });
  },

  onMenuTap(e: WechatMiniprogram.BaseEvent) {
    const url = (e.currentTarget as unknown as { dataset: { url: string } }).dataset.url;
    if (!url) {
      wx.showToast({ title: '敬请期待', icon: 'none' });
      return;
    }
    if (url.startsWith('/pages/recipes/list')) {
      wx.navigateTo({ url });
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

  // 防御性占位：让 wx 兼容 mascot iconFallback
  getMemberEmoji(idx: number) {
    return MEMBER_EMOJI[idx % MEMBER_EMOJI.length];
  },
});

