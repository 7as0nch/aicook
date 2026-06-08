// 分享导入页：接收 share_code → 预览菜谱 → 一键导入到本厨房
import { kitchenApi } from '../../../services/kitchen.api';
import type { RecipeShareSummary, RecipeDetail } from '../../../types/api';

Page({
  data: {
    code: '',
    loading: true,
    share: null as RecipeShareSummary | null,
    detail: null as RecipeDetail | null,
    importing: false,
    error: '',
  },

  onLoad(query: Record<string, string>) {
    const code = (query.code || '').trim();
    this.setData({ code });
    if (code) {
      void this.loadPreview(code);
    } else {
      this.setData({ loading: false, error: '缺少分享码' });
    }
  },

  async loadPreview(code: string) {
    this.setData({ loading: true, error: '' });
    try {
      const res = await kitchenApi.previewRecipeShare(code);
      this.setData({ share: res.share, detail: res.detail });
    } catch (e: any) {
      this.setData({ error: e?.message || '加载失败，分享码可能无效' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onImport() {
    if (this.data.importing) return;
    this.setData({ importing: true });
    try {
      const res = await kitchenApi.importRecipeShare(this.data.code);
      wx.showToast({ title: '已加入我的菜谱', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/recipes/detail/index?id=${res.recipe.id}` });
      }, 600);
    } catch (e) {
      wx.showToast({ title: '导入失败', icon: 'none' });
    } finally {
      this.setData({ importing: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.switchTab({ url: '/pages/home/index/index' }));
  },
});
