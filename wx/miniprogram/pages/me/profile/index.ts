// 个人资料编辑页
import { authStore } from '../../../store/auth.store';
import { authApi } from '../../../services/auth.api';
import { pickMedia, uploadFile } from '../../../services/upload';

Page({
  data: {
    user: null as unknown,
    displayName: '',
    avatarUrl: '',
    username: '',
    phone: '',
    email: '',
    avatarAssetId: '' as string,
    saving: false,
  },

  onLoad() {
    this.hydrate();
  },

  onShow() {
    this.hydrate();
  },

  hydrate() {
    const user = authStore.user;
    if (!user) {
      // 未登录跳登录
      wx.reLaunch({ url: '/pages/auth/login/index' });
      return;
    }
    this.setData({
      user,
      displayName: user.display_name || user.username || '',
      avatarUrl: user.avatar_url || '',
      username: user.username || '',
      phone: user.phone || '',
      email: user.email || '',
    });
  },

  onDisplayNameInput(e: WechatMiniprogram.Input) {
    this.setData({ displayName: e.detail.value });
  },

  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ email: e.detail.value });
  },

  async onAvatarTap() {
    try {
      const res = await pickMedia({ mediaKind: 'image', count: 1, sourceType: ['album', 'camera'] });
      const f = res.tempFiles?.[0];
      if (!f) return;
      this.setData({ avatarUrl: f.tempFilePath });
      const asset = await uploadFile({
        tempFilePath: f.tempFilePath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: f.size || 0,
      });
      this.setData({ avatarUrl: asset.url, avatarAssetId: String(asset.id) });
    } catch (e) {
      console.error('[profile] avatar fail', e);
    }
  },

  async onSave() {
    const name = this.data.displayName.trim();
    if (!name) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await authApi.updateProfile({
        display_name: name,
        avatar_asset_id: this.data.avatarAssetId || undefined,
      });
      await authStore.refreshMe();
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },
});
