// 菜谱列表（Tab 2）—— 美团点餐式：左类目侧栏 + 右菜谱列
// 顶部：搜索 + （类目即左栏）；右列每道菜支持编辑/删除；类目支持新建/长按删除
import { recipeApi } from '../../../services/recipe.api';
import { householdStore } from '../../../store/household.store';
import { hasToken } from '../../../utils/auth-guard';
import { on, EVENTS } from '../../../utils/eventbus';
import { recipeMetaLabel } from '../../../utils/format';
import type { Recipe, KitchenTag } from '../../../types/api';

const ALL_ID = '__all__';

interface CategoryCell {
  id: string;        // tag id 或 ALL_ID
  name: string;      // 过滤用的 tag name（全部为空）
  label: string;
  deletable: boolean; // 仅 type=2 用户标签可删
}

type RowRecipe = Recipe & { __meta: string };

Page({
  data: {
    keyword: '',
    categories: [] as CategoryCell[],
    activeCat: ALL_ID,
    recipes: [] as RowRecipe[],
    loading: false,
    catDialogVisible: false,
  },

  onLoad() {
    const self = this as unknown as { _offHouseholdSwitched?: () => void; _lastLoadAt?: number };
    self._offHouseholdSwitched = on(EVENTS.HOUSEHOLD_SWITCHED, () => {
      self._lastLoadAt = 0;
    });
  },

  onUnload() {
    const self = this as unknown as { _offHouseholdSwitched?: () => void };
    self._offHouseholdSwitched?.();
  },

  onShow() {
    if (!hasToken()) return;
    // 首页"按类型浏览"点选的类目（switchTab 不能带参，用 store 暂存）
    const pending = householdStore.pendingCategory;
    if (pending) {
      householdStore.setPendingCategory('');
      void this.buildCategories().then(() => {
        const hit = this.data.categories.find((c) => c.name === pending);
        this.setData({ activeCat: hit ? hit.id : ALL_ID });
        void this.loadRecipes(hit ? hit.name : '');
      });
      (this as unknown as { _lastLoadAt?: number })._lastLoadAt = Date.now();
      return;
    }
    const now = Date.now();
    const last = (this as unknown as { _lastLoadAt?: number })._lastLoadAt || 0;
    if (!this.data.recipes.length || now - last > 30000) {
      (this as unknown as { _lastLoadAt?: number })._lastLoadAt = now;
      void this.reload();
    }
  },

  async onPullDownRefresh() {
    await this.reload();
    wx.stopPullDownRefresh();
  },

  async reload() {
    await this.buildCategories();
    const cur = this.data.categories.find((c) => c.id === this.data.activeCat);
    await this.loadRecipes(cur?.name || '');
  },

  // 构建左侧类目栏（全部 + 家庭 KitchenTag）
  async buildCategories() {
    try {
      if (!householdStore.tags?.length) await householdStore.loadTags();
    } catch {
      /* 保留已有 */
    }
    const cells: CategoryCell[] = [
      { id: ALL_ID, name: '', label: '全部', deletable: false },
      ...householdStore.tags.map((t: KitchenTag) => ({
        id: String(t.id),
        name: t.name,
        label: t.name,
        deletable: Number(t.type) === 2,
      })),
    ];
    this.setData({ categories: cells });
  },

  async loadRecipes(categoryName: string, keyword?: string) {
    this.setData({ loading: true });
    try {
      const res = await recipeApi.list({
        limit: 50,
        exclude_draft: true,
        kitchen_tag: categoryName || undefined,
        keyword: keyword || undefined,
      });
      this.setData({
        recipes: (res.recipes || []).map((r) => ({ ...r, __meta: recipeMetaLabel(r) })),
      });
    } catch (e) {
      console.error('[recipes/list] load fail', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { id: string; name: string } }).dataset;
    if (ds.id === this.data.activeCat) return;
    this.setData({ activeCat: ds.id, keyword: '' });
    void this.loadRecipes(ds.name || '');
  },

  // 长按类目：用户类目可删（系统类目不可删）
  onCategoryLongpress(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { id: string; name: string; deletable: string } }).dataset;
    const cell = this.data.categories.find((c) => c.id === ds.id);
    if (!cell || !cell.deletable) {
      wx.showToast({ title: '系统类目不可删除', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: [`删除类目「${cell.label}」`],
      itemColor: '#E5604A',
      success: async (res) => {
        if (res.tapIndex !== 0) return;
        try {
          await householdStore.deleteTag(cell.id as unknown as KitchenTag['id']);
          // 若删的是当前选中类目，回退到「全部」
          const activeCat = this.data.activeCat === cell.id ? ALL_ID : this.data.activeCat;
          await this.buildCategories();
          this.setData({ activeCat });
          if (activeCat === ALL_ID) await this.loadRecipes('');
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.error('[recipes/list] delete tag fail', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  onAddCategory() {
    this.setData({ catDialogVisible: true });
  },
  onCatDialogClose() {
    this.setData({ catDialogVisible: false });
  },
  async onCatDialogConfirm(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const name = (e.detail?.value || '').trim();
    this.setData({ catDialogVisible: false });
    if (!name) return;
    if (householdStore.tags.some((t) => t.name === name)) {
      wx.showToast({ title: '类目已存在', icon: 'none' });
      return;
    }
    try {
      await householdStore.createTag(name);
      await this.buildCategories();
      const hit = this.data.categories.find((c) => c.name === name);
      this.setData({ activeCat: hit ? hit.id : ALL_ID });
      await this.loadRecipes(name);
      wx.showToast({ title: '已新增类目', icon: 'success' });
    } catch (err) {
      console.error('[recipes/list] create tag fail', err);
      wx.showToast({ title: '新增失败', icon: 'none' });
    }
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    const keyword = (this.data.keyword || '').trim();
    if (!keyword) {
      const cur = this.data.categories.find((c) => c.id === this.data.activeCat);
      void this.loadRecipes(cur?.name || '');
      return;
    }
    // 搜索跨类目：切回「全部」并按关键词过滤
    this.setData({ activeCat: ALL_ID });
    void this.loadRecipes('', keyword);
  },

  onRecipeTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (id) wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onEditRecipe(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (id) wx.navigateTo({ url: `/pages/recipes/editor/index?recipe_id=${id}` });
  },

  onDeleteRecipe(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    const target = this.data.recipes.find((r) => String(r.id) === String(id));
    if (!target) return;
    wx.showModal({
      title: '删除菜谱',
      content: `确定删除「${target.title}」？此操作不可恢复`,
      confirmText: '删除',
      confirmColor: '#E5604A',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await recipeApi.delete(target.id);
          this.setData({ recipes: this.data.recipes.filter((r) => String(r.id) !== String(id)) });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.error('[recipes/list] delete recipe fail', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  onWorkbenchTap() {
    wx.navigateTo({ url: '/pages/recipes/workbench/index' });
  },
});
