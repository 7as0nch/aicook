// 分享菜谱导入预览页：输入分享码后进入，展示对方厨房的菜谱列表，
// 勾选要导入的菜谱（默认全选）→ 克隆进当前厨房。
// 注意：分享码只用于导入菜谱副本，不会把当前用户加入对方家庭。
import { householdApi } from '../../../../services/household.api';
import type { Recipe } from '../../../../types/api';

interface PreviewRecipe {
  id: string;
  title: string;
  cover_image_url?: string;
  meta: string;
  selected: boolean;
}

function buildMeta(r: Recipe): string {
  const parts: string[] = [];
  if (r.category) parts.push(r.category);
  if (r.total_minutes) parts.push(`${r.total_minutes}分钟`);
  return parts.join(' · ');
}

Page({
  data: {
    code: '',
    householdName: '',
    recipes: [] as PreviewRecipe[],
    selectedCount: 0,
    allSelected: true,
    loading: true,
    importing: false,
    loadError: false,
  },

  onLoad(query: Record<string, string>) {
    const code = (query.code || '').trim();
    if (!code) {
      wx.showToast({ title: '缺少分享码', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ code });
    void this.loadPreview(code);
  },

  async loadPreview(code: string) {
    this.setData({ loading: true, loadError: false });
    try {
      const res = await householdApi.getKitchenByShareCode(code);
      const recipes: PreviewRecipe[] = (res.recipes || [])
        .map((it) => it.recipe)
        .filter((r): r is Recipe => !!r?.id)
        .map((r) => ({
          id: String(r.id),
          title: r.title || '未命名',
          cover_image_url: r.cover_image_url,
          meta: buildMeta(r),
          selected: true,
        }));
      this.setData({
        householdName: res.household?.name || '对方厨房',
        recipes,
        selectedCount: recipes.length,
        allSelected: true,
      });
    } catch {
      this.setData({ loadError: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  refreshSelection(recipes: PreviewRecipe[]) {
    const selectedCount = recipes.filter((r) => r.selected).length;
    this.setData({
      recipes,
      selectedCount,
      allSelected: recipes.length > 0 && selectedCount === recipes.length,
    });
  },

  onItemToggle(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id?: string } }).dataset.id;
    if (!id) return;
    const recipes = this.data.recipes.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r));
    this.refreshSelection(recipes);
  },

  onToggleAll() {
    const next = !this.data.allSelected;
    this.refreshSelection(this.data.recipes.map((r) => ({ ...r, selected: next })));
  },

  async onImport() {
    if (this.data.importing) return;
    const ids = this.data.recipes.filter((r) => r.selected).map((r) => r.id);
    if (!ids.length) {
      wx.showToast({ title: '请至少勾选一道菜', icon: 'none' });
      return;
    }
    this.setData({ importing: true });
    try {
      await householdApi.importSharedRecipes(this.data.code, ids);
      wx.showToast({ title: `已导入 ${ids.length} 道菜`, icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch {
      // importSharedRecipes 的错误 toast 已由 http.ts 统一处理
    } finally {
      this.setData({ importing: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },
});
