// 个人资料编辑页
// 微信头像/昵称获取规则（2022-10-25 后）：
//   1. 真实头像：必须用 <button open-type="chooseAvatar" bindchooseavatar>，
//      e.detail.avatarUrl 是临时本地路径，要先上传到 OSS 拿 asset_id。
//   2. 真实昵称：必须用 <input type="nickname">，键盘上方会推荐「使用微信昵称」。
import { authStore } from '../../../store/auth.store';
import { authApi } from '../../../services/auth.api';
import { uploadFile } from '../../../services/upload';

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
      wx.reLaunch({ url: '/pages/auth/login/index' });
      return;
    }
    this.setData({
      user,
      displayName: user.display_name || '',
      avatarUrl: user.avatar_url || '',
      username: user.username || '',
      phone: user.phone || '',
      email: user.email || '',
    });
  },

  onDisplayNameInput(e: WechatMiniprogram.Input) {
    this.setData({ displayName: e.detail.value });
  },

  // type="nickname" 在失焦时才把推荐项填进来，bindinput 拿不到完整值
  onDisplayNameBlur(e: WechatMiniprogram.Input) {
    const v = (e.detail.value || '').trim();
    if (v) this.setData({ displayName: v });
  },

  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ email: e.detail.value });
  },

  // 微信 chooseAvatar 回调：返回临时本地路径（wxfile://），上传 OSS 后拿 asset_id
  async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const tempPath = e.detail?.avatarUrl;
    if (!tempPath) return;
    this.setData({ avatarUrl: tempPath }); // 先用本地路径即时反馈
    try {
      // chooseAvatar 拿到的图大小未知，wx.getFileInfo 取一下
      const info = await new Promise<{ size: number }>((resolve) => {
        (wx as any).getFileInfo({
          filePath: tempPath,
          success: (r: { size: number }) => resolve({ size: r.size || 0 }),
          fail: () => resolve({ size: 0 }),
        });
      });
      const asset = await uploadFile({
        tempFilePath: tempPath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: info.size,
      });
      // 双重保险：asset.id 必须真值才存，避免 String(undefined)='undefined' 流到后续
      // 提交请求里 → 后端 proto int64 解析报 400。
      if (!asset?.id) {
        wx.showToast({ title: '头像上传失败', icon: 'none' });
        return;
      }
      // proto MediaAsset 的字段是 storage_url（预签名访问地址），不存在 url 字段
      this.setData({ avatarUrl: asset.storage_url || tempPath, avatarAssetId: String(asset.id) });
    } catch (err) {
      console.error('[profile] avatar upload fail', err);
      wx.showToast({ title: '头像上传失败', icon: 'none' });
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
      // 只把真的有值的字段塞 body；undefined 写在对象里 wx.request 可能序列化成
      // 字符串 "undefined" → 后端 proto int64 解析报 400。
      const payload: { display_name: string; avatar_asset_id?: string } = {
        display_name: name,
      };
      if (this.data.avatarAssetId) {
        payload.avatar_asset_id = this.data.avatarAssetId;
      }
      await authApi.updateProfile(payload);
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
