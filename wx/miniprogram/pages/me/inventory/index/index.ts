// 库存 / 冰箱页（设计稿 7 中"冰箱优先"入口）
// 顶部分类 tab + 食材列表 + 推荐能做的菜
import { inventoryStore } from '../../../../store/inventory.store';
import { kitchenApi } from '../../../../services/kitchen.api';
import { on, EVENTS } from '../../../../utils/eventbus';
import { emojiFor, categoryFor } from '../../../../utils/food-emoji';
import type { InventoryItem, InventoryRecommendation, Recipe } from '../../../../types/api';

const CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'vegetable', label: '蔬菜' },
  { key: 'meat', label: '肉蛋' },
  { key: 'condiment', label: '调料' },
  { key: 'other', label: '其它' },
];

// 展示用：补 emoji（后端无 icon_emoji），分类按食材名推断（后端 category 为中文 group_name 不可靠）
type InvDisplay = InventoryItem & { emoji: string };
function withEmoji(items: InventoryItem[]): InvDisplay[] {
  return items.map(it => ({ ...it, emoji: emojiFor(it.name) }));
}

Page({
  data: {
    tabs: CATEGORY_TABS,
    activeTab: 'all',
    items: [] as InvDisplay[],
    filtered: [] as InvDisplay[],
    recommendations: [] as Array<{ recipe: Recipe; match_count: number; ingredient_total: number; match_percent: number }>,
    keyword: '',
    // 添加食材弹层状态（wx.showModal 的 editable 已弃用，改自定义弹层）
    addVisible: false,
    addName: '',
    addQty: '',
    addSaving: false,
  },

  onLoad() {
    // 切换家庭后库存属于新家庭，标记脏数据，回到本页时强制刷新（库存数据按 household 隔离）
    const self = this as unknown as { _offHouseholdSwitched?: () => void; _dirty?: boolean };
    self._offHouseholdSwitched = on(EVENTS.HOUSEHOLD_SWITCHED, () => {
      self._dirty = true;
    });
    void this.refresh();
  },

  onShow() {
    const self = this as unknown as { _dirty?: boolean };
    if (self._dirty) {
      self._dirty = false;
      void this.refresh();
    }
  },

  onUnload() {
    const self = this as unknown as { _offHouseholdSwitched?: () => void };
    self._offHouseholdSwitched?.();
  },

  async refresh() {
    try {
      await inventoryStore.load();
      this.setData({ items: withEmoji(inventoryStore.items as InventoryItem[]) });
      this.applyFilter();
    } catch (e) {
      console.error(e);
    }
  },

  applyFilter() {
    const { items, activeTab, keyword } = this.data;
    let filtered = items.slice();
    if (activeTab !== 'all') {
      // 按食材名归类（后端 category 是中文 group_name，与 tab key 对不上）
      filtered = filtered.filter(it => categoryFor(it.name) === activeTab);
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
    this.setData({ addVisible: true, addName: '', addQty: '', addSaving: false });
  },

  onAddClose() {
    this.setData({ addVisible: false });
  },

  onAddNameInput(e: WechatMiniprogram.Input) {
    this.setData({ addName: e.detail.value });
  },

  onAddQtyInput(e: WechatMiniprogram.Input) {
    this.setData({ addQty: e.detail.value });
  },

  async onAddConfirm() {
    const name = this.data.addName.trim();
    if (!name) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    if (this.data.addSaving) return;
    this.setData({ addSaving: true });
    try {
      await inventoryStore.upsert([{ name, kind: 'manual', quantity_text: this.data.addQty.trim() }]);
      this.setData({ items: withEmoji(inventoryStore.items as InventoryItem[]), addVisible: false });
      this.applyFilter();
      wx.showToast({ title: '已添加', icon: 'success' });
    } catch {
      wx.showToast({ title: '添加失败', icon: 'none' });
    } finally {
      this.setData({ addSaving: false });
    }
  },

  // 弹层蒙层 catchtouchmove 占位，阻止滚动穿透
  noop() {},

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
