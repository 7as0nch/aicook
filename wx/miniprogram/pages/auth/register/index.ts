// 注册页
import { authStore } from '../../../store/auth.store';

Page({
  data: {
    username: '',
    password: '',
    display_name: '',
    household_name: '',
    loading: false,
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as 'username' | 'password' | 'display_name' | 'household_name';
    this.setData({ [field]: e.detail.value });
  },

  async onSubmit() {
    const { username, password, display_name, household_name } = this.data;
    if (!username || !password || !display_name) {
      wx.showToast({ title: '请填写必填项', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      await authStore.register({ username, password, display_name, household_name });
      wx.reLaunch({ url: '/pages/home/index/index' });
    } catch (e) {
      console.warn('[register] failed', e);
    } finally {
      this.setData({ loading: false });
    }
  },
});
