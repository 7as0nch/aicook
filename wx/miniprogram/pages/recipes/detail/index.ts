// 菜谱详情（设计稿 04）
// hero 图 + 标题 meta + 4 tab(食材/步骤/AI 指导/营养) + 底部 sticky bar
import { recipeApi } from '../../../services/recipe.api';
import { kitchenApi } from '../../../services/kitchen.api';
import { chatStore } from '../../../store/chat.store';
import { authStore } from '../../../store/auth.store';
import { stableMediaURL, stableMediaURLs } from '../../../utils/media-cache';
import type { Recipe, RecipeIngredient, RecipeStep } from '../../../types/api';

type DetailTab = 'ingredients' | 'steps' | 'nutrition';

interface IngredGroup {
  groupName: string;
  items: RecipeIngredient[];
}

// 步骤视图模型：在 RecipeStep 上补一个已归一(过缓存)的图片数组，wxml 直接遍历多图。
type StepVM = RecipeStep & { images: string[] };

// 取某步骤的图片列表：优先多图 media_urls，回退单图 media_url，无图返回 []。
function stepImages(s: RecipeStep): string[] {
  const raw = s.media_urls && s.media_urls.length ? s.media_urls : s.media_url ? [s.media_url] : [];
  return stableMediaURLs(raw.filter(Boolean));
}

Page({
  data: {
    id: '' as string,
    activeTab: 'steps' as DetailTab,
    loading: true,
    recipe: null as Recipe | null,
    difficultyLabel: '',
    ingredientGroups: [] as IngredGroup[],
    steps: [] as StepVM[],
    favored: false,
    canEdit: false,
    // 顶部轮播媒体（封面图集，可含 ≤10s 短视频）；长视频单独走 longVideoUrl
    mediaList: [] as string[],
    longVideoUrl: '',
    // 草稿且本家庭可编辑 → 显示「发布」入口
    isDraft: false,
  },

  onLoad(query: Record<string, string>) {
    this.setData({ id: query.id || '' });
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
      // 轮播媒体：优先图集，回退单封面；统一过签名 URL 缓存，避免每次进页重下
      const gallery = ((detail.recipe.gallery_image_urls as string[] | undefined) || []).filter(Boolean);
      const mediaList = gallery.length
        ? gallery
        : (detail.recipe.cover_image_url ? [detail.recipe.cover_image_url] : []);
      // 步骤：预计算多图列表（过缓存），wxml 直接遍历 step.images
      const steps: StepVM[] = (detail.steps || []).map((s) => ({ ...s, images: stepImages(s) }));
      this.setData({
        recipe: detail.recipe,
        difficultyLabel: diffLabel,
        favored: !!detail.recipe.favored,
        ingredientGroups: grouped,
        steps,
        canEdit,
        mediaList: stableMediaURLs(mediaList),
        longVideoUrl: stableMediaURL(detail.recipe.video_url || ''),
        isDraft: detail.recipe.status === 'draft' && canEdit,
      });
    } catch (e) {
      console.error('load detail error', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
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

  // 草稿一键发布为正式菜谱（发布后首页/推荐/选菜可见）
  async onPublishTap() {
    if (!this.data.id) return;
    try {
      await recipeApi.publish(this.data.id);
      const recipe = this.data.recipe ? { ...this.data.recipe, status: 'published' } : this.data.recipe;
      this.setData({ isDraft: false, recipe });
      wx.showToast({ title: '已发布', icon: 'success' });
    } catch {
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
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

  // 长按分享按钮：生成并复制分享码（点按则由 button[open-type=share] 走原生转发）
  async onCopyShareCode() {
    if (!this.data.id) return;
    try {
      const r = await kitchenApi.createRecipeShare(this.data.id);
      const code = r.share?.share_code || '';
      if (code) {
        wx.setClipboardData({
          data: code,
          success: () => wx.showToast({ title: '分享码已复制，发给好友导入', icon: 'success' }),
        });
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    } catch {
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  // 微信小程序原生「转发给好友」回调（点右上角 ⋯ → 转发触发）
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const recipe = this.data.recipe;
    return {
      title: recipe ? `${recipe.title} - 萝卜爱做饭` : '萝卜爱做饭',
      path: `/pages/recipes/detail/index?id=${this.data.id}`,
      imageUrl: recipe?.cover_image_url,
    };
  },

  // 朋友圈
  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const recipe = this.data.recipe;
    return {
      title: recipe ? `${recipe.title} - 萝卜爱做饭 AI 菜谱` : '萝卜爱做饭',
      imageUrl: recipe?.cover_image_url,
    };
  },

  // 点步骤缩略图：全屏预览该步全部图片，从点中的那张开始
  onStepImgTap(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { idx: string; j: string } }).dataset;
    const step = this.data.steps?.[Number(ds.idx)];
    if (!step || !step.images?.length) return;
    wx.previewImage({ current: step.images[Number(ds.j)] || step.images[0], urls: step.images });
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
