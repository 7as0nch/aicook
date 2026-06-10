// AIcook 小程序入口
// 职责：冷启动恢复登录态、初始化全局 store、监听网络变化、注入主题。
import { authStore } from './store/auth.store';
import { initEnv } from './utils/env';

interface AppGlobalData {
  systemInfo?: WechatMiniprogram.SystemInfo;
}

App({
  globalData: {} as AppGlobalData,

  onLaunch() {
    // 1. 初始化环境（base url 等）
    initEnv();

    // 2. 同步系统信息（用于安全区、设备类型适配）
    try {
      this.globalData.systemInfo = wx.getSystemInfoSync();
    } catch (e) {
      console.error('[app] getSystemInfoSync failed', e);
    }

    // 3. 恢复持久化登录态，并异步校验
    authStore.restoreFromStorage();
    if (authStore.token) {
      authStore.refreshMe().catch((err) => {
        console.warn('[app] refreshMe failed', err);
      });
    } else {
      // 未登录：立即跳登录页。
      // 注意：原来用 setTimeout(50ms) 是为了避开 tabBar 初始化时序问题，但
      // 这 50ms 窗口里首页 onLoad/onShow 会先跑、触发 N 个 401 请求。
      // http.ts 已增加 token 同步守卫拦截，再加上这里立即 reLaunch，
      // 双保险消除空请求洪水。
      wx.reLaunch({ url: '/pages/auth/login/index' });
    }

    // 4. 监听网络变化（弱网提示）
    wx.onNetworkStatusChange((res) => {
      if (!res.isConnected) {
        wx.showToast({ title: '网络已断开', icon: 'none' });
      }
    });
  },

  onShow() {
    // 切前台时若 token 已失效，refreshMe 会触发 401 拦截 → 跳登录
    if (authStore.token) {
      authStore.refreshMe().catch(() => {
        // 静默失败；http 拦截器统一处理 401
      });
    }
  },

  onError(err: string) {
    console.error('[app:onError]', err);
  },
});
