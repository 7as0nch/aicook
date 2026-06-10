// 登录态守卫工具
// 用法：
//   - hasToken()         在 onLoad / onShow / 数据加载入口同步判定
//   - requireAuth()      未登录则跳登录页并返回 false
//
// 设计要点：
//   1. 仅基于持久化的 token 判定，避免依赖 mobx store 在某些生命周期还没注水
//   2. 跳转用了 nav.ts 的并发锁，多次调用只会触发一次 reLaunch
//   3. 不调用 wx.showToast — 调用方需要时自行加

import { getItem, STORAGE_KEYS } from './storage';
import { redirectToLogin } from './nav';

interface PersistedAuth {
  token?: string;
}

/** 同步读 storage 判断当前是否登录。比读 authStore 更可靠（cold start 时机问题）。 */
export function hasToken(): boolean {
  try {
    const auth = getItem<PersistedAuth>(STORAGE_KEYS.AUTH);
    return !!auth?.token;
  } catch {
    return false;
  }
}

/**
 * 守卫调用。未登录则跳登录页并返回 false；调用方应据此早退避免发出无谓请求。
 *
 * @example
 *   onShow() {
 *     if (!requireAuth()) return;
 *     void this.loadAll();
 *   }
 */
export function requireAuth(): boolean {
  if (hasToken()) return true;
  redirectToLogin();
  return false;
}
