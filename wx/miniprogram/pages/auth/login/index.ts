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

  async onWxLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const loginRes = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) {
        wx.showToast({ title: '微信授权失败', icon: 'none' });
        return;
      }
      // 选填：getUserProfile 拿昵称/头像（仅个人开发者可用）
      let nickname = '';
      let avatarUrl = '';
      try {
        const profile = await new Promise<WechatMiniprogram.GetUserProfileSuccessCallbackResult>((resolve, reject) => {
          wx.getUserProfile({ desc: '用于完善会员资料', success: resolve, fail: reject });
        });
        nickname = profile.userInfo?.nickName || '';
        avatarUrl = profile.userInfo?.avatarUrl || '';
      } catch (_) {
        // 用户拒绝授权也允许登录，仅 openid 注册
      }
      await authStore.loginByWx({ code: loginRes.code, nickname, avatar_url: avatarUrl });
      wx.reLaunch({ url: '/pages/home/index/index' });
    } catch (e: any) {
      console.warn('[wxLogin] failed', e);
      wx.showToast({ title: e?.message || '微信登录失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
