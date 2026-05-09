// 登录页
// 阶段 0：骨架；阶段 1 接入 authStore.login() 完整流程
import { authStore } from '../../../store/auth.store';

Page({
  data: {
    username: '',
    password: '',
    loading: false,
  },

  onUsernameInput(e: WechatMiniprogram.Input) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e: WechatMiniprogram.Input) {
    this.setData({ password: e.detail.value });
  },

  async onLoginTap() {
    const { username, password } = this.data;
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      await authStore.login({ username, password });
      wx.reLaunch({ url: '/pages/home/index/index' });
    } catch (e) {
      console.warn('[login] failed', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pages/auth/register/index' });
  },
});
