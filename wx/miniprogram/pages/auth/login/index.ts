// 登录页
// 默认视图：微信一键登录（绿色大按钮 + 底部「其他登录方式」小字）
// 账号密码登录隐藏在「其他登录方式」之后
import { authStore } from '../../../store/auth.store';

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    showAccountForm: false, // false: 默认微信视图；true: 切到账号密码表单
  },

  onLoad() {
    // 已登录态守卫：有 token 直接跳首页（避免回到登录页空界面）
    if (authStore.token) {
      wx.reLaunch({ url: '/pages/home/index/index' });
    }
  },

  // ====== 视图切换 ======
  onShowAccountForm() {
    this.setData({ showAccountForm: true });
  },

  onHideAccountForm() {
    this.setData({ showAccountForm: false });
  },

  // ====== 账号密码登录（隐藏入口） ======
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

  // ====== 微信一键登录（默认入口） ======
  // 注：wx.getUserProfile 自 2022-10-25 起被微信收回（即便用户授权也只返回「微信用户」
  // + 默认灰头像），所以这里只用 wx.login 拿 code。真实昵称/头像由用户在
  // 「我的-个人资料」页用 button open-type="chooseAvatar" + input type="nickname" 自行设置。
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
      await authStore.loginByWx({ code: loginRes.code, nickname: '', avatar_url: '' });
      wx.reLaunch({ url: '/pages/home/index/index' });
    } catch (e: any) {
      console.warn('[wxLogin] failed', e);
      wx.showToast({ title: e?.message || '微信登录失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
