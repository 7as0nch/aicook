// 路由封装：统一处理 tabBar 页面与普通页面的跳转，支持登录守卫

import { authStore } from '../store/auth.store';

// 5 个 tabBar 页面路径（与 app.json 一致）
const TAB_PAGES = new Set([
  '/pages/home/index/index',
  '/pages/recipes/list/index',
  '/pages/plan/index/index',
  '/pages/ai/index/index',
  '/pages/me/index/index',
]);

// 免登录访问的页面
const PUBLIC_PAGES = new Set([
  '/pages/auth/login/index',
  '/pages/auth/register/index',
]);

export interface NavOptions {
  // 是否要求登录（默认 true）
  requireAuth?: boolean;
}

export function navTo(path: string, options: NavOptions = {}): void {
  const requireAuth = options.requireAuth !== false && !PUBLIC_PAGES.has(path);
  if (requireAuth && !authStore.token) {
    redirectToLogin();
    return;
  }
  if (TAB_PAGES.has(path)) {
    wx.switchTab({ url: path });
  } else {
    wx.navigateTo({ url: path });
  }
}

export function redirectTo(path: string): void {
  if (TAB_PAGES.has(path)) {
    wx.switchTab({ url: path });
  } else {
    wx.redirectTo({ url: path });
  }
}

export function reLaunchTo(path: string): void {
  wx.reLaunch({ url: path });
}

export function back(delta = 1): void {
  wx.navigateBack({ delta }).catch(() => {
    // 没有历史栈时回首页
    wx.switchTab({ url: '/pages/home/index/index' });
  });
}

let _redirectingToLogin = false;
export function redirectToLogin(): void {
  if (_redirectingToLogin) return;
  _redirectingToLogin = true;
  wx.reLaunch({
    url: '/pages/auth/login/index',
    complete: () => {
      _redirectingToLogin = false;
    },
  });
}
