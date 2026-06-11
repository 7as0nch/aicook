// 菜谱详情（设计稿 04）
// hero 图 + 标题 meta + 4 tab(食材/步骤/AI 指导/营养) + 底部 sticky bar
import { recipeApi } from '../../../services/recipe.api';
import { kitchenApi } from '../../../services/kitchen.api';
import { chatStore } from '../../../store/chat.store';
import { authStore } from '../../../store/auth.store';
import type { Recipe, RecipeIngredient, RecipeStep } from '../../../types/api';

type DetailTab = 'ingredients' | 'steps' | 'nutrition';

interface IngredGroup {
  groupName: string;
  items: RecipeIngredient[];
}

Page({
  data: {
    id: '' as string,
    activeTab: 'steps' as DetailTab,
    statusBarHeight: 20,
    // 顶部悬浮操作栏的 top：与微信胶囊垂直对齐（取胶囊 top）
    capsuleTop: 30,
    loading: true,
    recipe: null as Recipe | null,
    difficultyLabel: '',
    ingredientGroups: [] as IngredGroup[],
    steps: [] as RecipeStep[],
    favored: false,
    canEdit: false,
  },

  onLoad(query: Record<string, string>) {
    const info = wx.getWindowInfo?.() || wx.getSystemInfoSync();
    const statusBarHeight = (info as any).statusBarHeight || 20;
    let capsuleTop = statusBarHeight + 6;
    try {
      const menu = wx.getMenuButtonBoundingClientRect?.();
      if (menu && menu.top) capsuleTop = menu.top;
    } catch (_) { /* 胶囊 API 不可用时回退 */ }
    this.setData({ statusBarHeight, capsuleTop, id: query.id || '' });
    void this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.id) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await recipeApi.detail(this.data.id);
      const detail = res.detail;
      const grouped = groupIngredients(detail.ingredients || []);
      const diff = (detail.recipe as { difficulty?: number | string }).difficulty;
      const diffLabel = diff ? (typeof diff === 'string' ? diff : ['', '入门', '简单', '中等', '挑战', '大师'][Number(diff)] || '中等') : '';
      // 只允许编辑本家庭的菜谱（分享导入的副本 household_id 也是本家庭，可编辑）
      const canEdit = String(detail.recipe.household_id || '') === String(authStore.currentHousehold?.id || '');
      this.setData({
        recipe: detail.recipe,
        difficultyLabel: diffLabel,
        favored: !!detail.recipe.favored,
        ingredientGroups: grouped,
        steps: detail.steps || [],
        canEdit,
      });
    } catch (e) {
      console.error('load detail error', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.switchTab({ url: '/pages/home/index/index' }));
  },

  onTabSwitch(e: WechatMiniprogram.BaseEvent) {
    const tab = (e.currentTarget as unknown as { dataset: { tab: DetailTab } }).dataset.tab;
    this.setData({ activeTab: tab });
  },

  onCookTap() {
    if (!this.data.id) return;
    wx.navigateTo({ url: `/pages/recipes/cooking/index?id=${this.data.id}` });
  },

  onEditTap() {
    if (!this.data.id) return;
    wx.navigateTo({ url: `/pages/recipes/editor/index?recipe_id=${this.data.id}` });
  },

  async onFavTap() {
    if (!this.data.id) return;
    const next = !this.data.favored;
    this.setData({ favored: next }); // optimistic
    try {
      if (next) {
        await recipeApi.addFavorite(this.data.id);
      } else {
        await recipeApi.removeFavorite(this.data.id);
      }
      wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'success' });
    } catch (e) {
      // rollback
      this.setData({ favored: !next });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onShareTap() {
    if (!this.data.id) return;
    // 触发微信原生分享菜单（小程序卡片 / 朋友圈 / 复制链接）
    wx.showActionSheet({
      itemList: ['转发给好友', '复制分享码'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          // 通过 button[open-type=share] 或 onShareAppMessage 触发
          wx.showToast({ title: '请点击右上 ⋯ → 转发', icon: 'none', duration: 2200 });
        } else if (res.tapIndex === 1) {
          try {
            const r = await kitchenApi.createRecipeShare(this.data.id);
            const code = r.share?.share_code || '';
            if (code) {
              wx.setClipboardData({
                data: code,
                success: () => wx.showToast({ title: '分享码已复制', icon: 'success' }),
              });
            }
          } catch {
            wx.showToast({ title: '生成失败', icon: 'none' });
          }
        }
      },
    });
  },

  // 微信小程序原生「转发给好友」回调（点右上角 ⋯ → 转发触发）
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const recipe = this.data.recipe;
    return {
      title: recipe ? `${recipe.title} - 馋猫厨房` : '馋猫厨房',
      path: `/pages/recipes/detail/index?id=${this.data.id}`,
      imageUrl: recipe?.cover_image_url,
    };
  },

  // 朋友圈
  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const recipe = this.data.recipe;
    return {
      title: recipe ? `${recipe.title} - 馋猫厨房 AI 菜谱` : '馋猫厨房',
      imageUrl: recipe?.cover_image_url,
    };
  },

  onStepLongpress(e: WechatMiniprogram.BaseEvent) {
    const stepIndex = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const step = this.data.steps?.[stepIndex];
    if (!step) return;
    wx.showActionSheet({
      itemList: ['问 AI 这步怎么做'],
      success: (res) => {
        if (res.tapIndex === 0) {
          chatStore.openSheet({
            scene: 'cooking_guide',
            recipe_id: this.data.id,
            quote_context: {
              scene: 'cooking',
              selected_text: step.description,
              surrounding_text: `第 ${step.step_no} 步：${step.title || ''}\n${step.description}`,
              selection_source: `recipe/${this.data.id}/step/${step.step_no}`,
            },
          });
        }
      },
    });
  },
});

function groupIngredients(items: RecipeIngredient[]): IngredGroup[] {
  const groups = new Map<string, RecipeIngredient[]>();
  for (const item of items) {
    const key = (item.group_name || '主料').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries()).map(([groupName, items]) => ({ groupName, items }));
}
