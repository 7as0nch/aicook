// 采购清单页
import { kitchenApi } from '../../../services/kitchen.api';
import type { ShoppingList, ShoppingListItem } from '../../../types/api';

interface CategoryGroup {
  category: string;
  items: ShoppingListItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  vegetable: '🥬 蔬菜',
  meat: '🍖 肉蛋',
  seasoning: '🧂 调料',
  grain: '🌾 主食',
  fruit: '🍎 水果',
  other: '🛒 其他',
  '': '🛒 其他',
};

Page({
  data: {
    list: null as ShoppingList | null,
    groups: [] as CategoryGroup[],
    total: 0,
    completed: 0,
    progress: 0,
    loading: false,
    empty: false,
  },

  onShow() {
    void this.loadList();
  },

  async onPullDownRefresh() {
    await this.loadList();
    wx.stopPullDownRefresh();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await kitchenApi.getShoppingList();
      const list = res.list;
      const items = res.items || [];
      this.applyData(list, items);
      this.setData({ empty: items.length === 0 });
    } catch (e) {
      console.error('[shopping] load fail', e);
      this.setData({ empty: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyData(list: ShoppingList | null, items: ShoppingListItem[]) {
    const grouped: Record<string, ShoppingListItem[]> = {};
    items.forEach(it => {
      const cat = (it.category || 'other').toLowerCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    });
    const groups = Object.keys(grouped).map(k => ({ category: k, items: grouped[k] }));
    const total = items.length;
    const completed = items.filter(it => it.checked).length;
    const progress = total === 0 ? 0 : Math.round(completed / total * 100);
    this.setData({ list, groups, total, completed, progress });
  },

  async onToggleItem(e: WechatMiniprogram.BaseEvent) {
    const itemId = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (!itemId || !this.data.list) return;
    const list = this.data.list;
    const all: ShoppingListItem[] = this.data.groups.flatMap(g => g.items);
    const target = all.find(i => String(i.id) === String(itemId));
    if (!target) return;
    const willCheck = !target.checked;
    // optimistic
    this.applyData(list, all.map(i => i.id === target.id ? { ...i, checked: willCheck } : i));
    try {
      await kitchenApi.patchShoppingItem({
        list_id: list.id,
        item_id: target.id,
        checked: willCheck,
      });
    } catch (e) {
      // rollback
      this.applyData(list, all);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  async onCompleteList() {
    if (!this.data.list) return;
    try {
      await kitchenApi.completeShoppingList(this.data.list.id);
      wx.showToast({ title: '已完成', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onGenerate() {
    try {
      const res = await kitchenApi.generateShoppingList();
      this.applyData(res.list, res.items || []);
      this.setData({ empty: !res.items?.length });
      wx.showToast({ title: '生成成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  categoryLabel(cat: string): string {
    return CATEGORY_LABELS[cat] || `🛒 ${cat || '其他'}`;
  },
});
