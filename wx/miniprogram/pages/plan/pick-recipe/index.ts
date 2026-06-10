// 周计划选菜页：从菜谱库中挑一道菜加入指定日期的指定餐次。
// 通过 wx.navigateTo 的 events 反向通道把选中的菜谱回传给计划页（事件名 recipePicked）。
import { recipeApi } from '../../../services/recipe.api';
import type { Recipe } from '../../../types/api';

const SLOT_LABEL: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };

Page({
  data: {
    slotLabel: '',
    dateLabel: '',
    keyword: '',
    recipes: [] as Recipe[],
    loading: false,
    loaded: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const slot = options.slot || '';
    const date = options.date || '';
    this.setData({
      slotLabel: SLOT_LABEL[slot] || '餐次',
      dateLabel: date,
    });
    void this.search('');
  },

  async search(keyword: string) {
    this.setData({ loading: true });
    try {
      const res = await recipeApi.list({ limit: 50, keyword: keyword || undefined, exclude_draft: true });
      this.setData({ recipes: res.recipes || [], loaded: true });
    } catch {
      this.setData({ recipes: [], loaded: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    void this.search(this.data.keyword.trim());
  },

  onRecipeTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id?: string } }).dataset.id;
    const recipe = this.data.recipes.find((r) => String(r.id) === String(id));
    if (!recipe) return;
    const channel = this.getOpenerEventChannel?.();
    if (channel?.emit) {
      channel.emit('recipePicked', { recipe });
    }
    wx.navigateBack();
  },

  onBack() {
    wx.navigateBack();
  },
});
