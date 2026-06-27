// 意见反馈 - 提交表单
// 类型 chip + 文字内容（必填）+ 截图（最多 3 张，两步直传）+ 联系方式（选填）
import { feedbackApi } from '../../../../services/feedback.api';
import { pickMedia, uploadFile } from '../../../../services/upload';

const MAX_IMAGES = 3;
const MAX_CONTENT = 500;

const CATEGORIES = [
  { value: 'suggestion', label: '功能建议' },
  { value: 'bug', label: '问题反馈' },
  { value: 'other', label: '其他' },
];

interface ImageItem {
  key: number;
  localPath: string;
  assetId: string;
  url: string;
  uploading: boolean;
}

Page({
  data: {
    categories: CATEGORIES,
    category: 'suggestion',
    content: '',
    contentLen: 0,
    maxContent: MAX_CONTENT,
    contact: '',
    images: [] as ImageItem[],
    maxImages: MAX_IMAGES,
    submitting: false,
  },

  _keySeq: 0,

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const v = (e.currentTarget as unknown as { dataset: { value: string } }).dataset.value;
    this.setData({ category: v });
  },

  onContentInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value || '';
    this.setData({ content: v, contentLen: v.length });
  },

  onContactInput(e: WechatMiniprogram.Input) {
    this.setData({ contact: e.detail.value });
  },

  // 更新指定 key 的图片项（避免并发上传时下标错位）
  patchImage(key: number, patch: Partial<ImageItem>) {
    const images = this.data.images.map((it) => (it.key === key ? { ...it, ...patch } : it));
    this.setData({ images });
  },

  removeImageByKey(key: number) {
    this.setData({ images: this.data.images.filter((it) => it.key !== key) });
  },

  async onAddImage() {
    const remaining = MAX_IMAGES - this.data.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多 ${MAX_IMAGES} 张`, icon: 'none' });
      return;
    }
    let res: WechatMiniprogram.ChooseMediaSuccessCallbackResult;
    try {
      res = await pickMedia({ mediaKind: 'image', count: remaining });
    } catch (e) {
      return; // 用户取消
    }
    const files = res.tempFiles || [];
    for (const f of files) {
      if (this.data.images.length >= MAX_IMAGES) break;
      const key = ++this._keySeq;
      const item: ImageItem = { key, localPath: f.tempFilePath, assetId: '', url: '', uploading: true };
      this.setData({ images: [...this.data.images, item] });
      try {
        const asset = await uploadFile({
          tempFilePath: f.tempFilePath,
          mediaKind: 'image',
          contentType: 'image/jpeg',
          sizeBytes: f.size || 0,
        });
        if (!asset?.id) throw new Error('missing asset id');
        this.patchImage(key, {
          assetId: String(asset.id),
          url: asset.storage_url || f.tempFilePath,
          uploading: false,
        });
      } catch (err) {
        this.removeImageByKey(key);
        wx.showToast({ title: '图片上传失败', icon: 'none' });
      }
    }
  },

  onRemoveImage(e: WechatMiniprogram.BaseEvent) {
    const key = Number((e.currentTarget as unknown as { dataset: { key: number } }).dataset.key);
    this.removeImageByKey(key);
  },

  async onSubmit() {
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (this.data.images.some((it) => it.uploading)) {
      wx.showToast({ title: '图片上传中，请稍候', icon: 'none' });
      return;
    }
    const imageAssetIds = this.data.images.filter((it) => it.assetId).map((it) => it.assetId);
    this.setData({ submitting: true });
    try {
      await feedbackApi.submit({
        category: this.data.category,
        content,
        image_asset_ids: imageAssetIds,
        contact: this.data.contact.trim(),
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      // 让上一页（我的反馈列表）下次 onShow 强制刷新
      const pages = getCurrentPages();
      const prev = pages[pages.length - 2] as unknown as { _lastLoadAt?: number } | undefined;
      if (prev) prev._lastLoadAt = 0;
      setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
    } catch (e) {
      // http 封装已统一 toast
    } finally {
      this.setData({ submitting: false });
    }
  },
});
