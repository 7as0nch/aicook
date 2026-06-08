// 库存 / 冰箱页（设计稿 7 中"冰箱优先"入口）
// 顶部分类 tab + 食材列表 + 推荐能做的菜
import { inventoryStore } from '../../../../store/inventory.store';
import { kitchenApi } from '../../../../services/kitchen.api';
import type { InventoryItem, InventoryRecommendation, Recipe } from '../../../../types/api';

const CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'vegetable', label: '蔬菜' },
  { key: 'meat', label: '肉蛋' },
  { key: 'condiment', label: '调料' },
  { key: 'other', label: '其它' },
];

Page({
  data: {
    tabs: CATEGORY_TABS,
    activeTab: 'all',
    items: [] as InventoryItem[],
    filtered: [] as InventoryItem[],
    recommendations: [] as Array<{ recipe: Recipe; match_count: number; ingredient_total: number; match_percent: number }>,
    keyword: '',
  },

  onLoad() {
    void this.refresh();
  },

  async refresh() {
    try {
      await inventoryStore.load();
      this.setData({ items: inventoryStore.items as InventoryItem[] });
      this.applyFilter();
    } catch (e) {
      console.error(e);
    }
  },

  applyFilter() {
    const { items, activeTab, keyword } = this.data;
    let filtered = items.slice();
    if (activeTab !== 'all') {
      filtered = filtered.filter(it => (it.category || '').toLowerCase() === activeTab);
    }
    if (keyword) {
      const k = keyword.toLowerCase();
      filtered = filtered.filter(it => (it.name || '').toLowerCase().includes(k));
    }
    this.setData({ filtered });
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  onTabTap(e: WechatMiniprogram.BaseEvent) {
    const key = (e.currentTarget as unknown as { dataset: { key: string } }).dataset.key;
    this.setData({ activeTab: key });
    this.applyFilter();
  },

  onAdd() {
    wx.showModal({
      title: '添加食材',
      placeholderText: '食材名（可加数量，如：番茄 3 个）',
      editable: true,
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const text = res.content.trim();
        const m = text.match(/^(.+?)\s+(.+)$/);
        const name = m ? m[1] : text;
        const qty = m ? m[2] : '';
        try {
          await inventoryStore.upsert([{ name, kind: 'manual', quantity_text: qty }]);
          this.setData({ items: inventoryStore.items as InventoryItem[] });
          this.applyFilter();
          wx.showToast({ title: '已添加', icon: 'success' });
        } catch {
          wx.showToast({ title: '添加失败', icon: 'none' });
        }
      },
    });
  },

  async onItemRemove(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (!id) return;
    try {
      await kitchenApi.patchInventory({ item_id: id, status: 'consumed' });
      await this.refresh();
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onRecommendTap() {
    try {
      await inventoryStore.loadRecommendations(8);
      const recs = (inventoryStore.recommendations as InventoryRecommendation[]).map(r => ({
        recipe: r.recipe,
        match_count: r.match_count,
        ingredient_total: r.ingredient_total,
        match_percent: r.match_percent,
      }));
      this.setData({ recommendations: recs });
      if (!recs.length) {
        wx.showToast({ title: '无匹配推荐', icon: 'none' });
        return;
      }
      // 同时跳转到今日推荐页传递当前食材
      const names = (this.data.items as InventoryItem[]).slice(0, 8).map(it => it.name).filter(Boolean).join(',');
      if (names) {
        wx.navigateTo({ url: `/pages/recipes/today/index?ingredients=${encodeURIComponent(names)}` });
      }
    } catch (e) {
      wx.showToast({ title: '获取推荐失败', icon: 'none' });
    }
  },

  onRecipeTap(e: WechatMiniprogram.CustomEvent<{ recipe: Recipe }>) {
    const id = e.detail?.recipe?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.switchTab({ url: '/pages/home/index/index' }));
  },
});
