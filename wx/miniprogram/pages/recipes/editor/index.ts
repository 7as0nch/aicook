// 菜谱草稿编辑页：接收 AI 生成的 draft → 用户编辑食材/步骤 → 保存为草稿
import { recipeApi, CreateDraftIngredient, CreateDraftStep } from '../../../services/recipe.api';

interface DraftIngredient extends CreateDraftIngredient {
  // 仅前端用，不传给后端
  _key?: string;
}

interface DraftStep extends CreateDraftStep {
  _key?: string;
}

interface DraftPayload {
  title?: string;
  summary?: string;
  cover_image_url?: string;
  category?: string;
  total_minutes?: number;
  difficulty?: number;
  scenario_tags?: string[];
  flavor_tags?: string[];
  ingredients?: DraftIngredient[];
  steps?: DraftStep[];
}

Page({
  data: {
    title: '',
    summary: '',
    coverImageUrl: '',
    totalMinutes: 30,
    difficulty: 2,
    ingredients: [] as DraftIngredient[],
    steps: [] as DraftStep[],
    saving: false,
  },

  onLoad(query: Record<string, string>) {
    if (query.draft) {
      try {
        const draft = JSON.parse(decodeURIComponent(query.draft)) as DraftPayload;
        this.hydrate(draft);
      } catch (e) {
        console.error('[editor] parse draft fail', e);
      }
    }
  },

  hydrate(d: DraftPayload) {
    this.setData({
      title: d.title || '',
      summary: d.summary || '',
      coverImageUrl: d.cover_image_url || '',
      totalMinutes: d.total_minutes || 30,
      difficulty: d.difficulty || 2,
      ingredients: (d.ingredients || []).map((it, i) => ({ ...it, _key: `i-${i}` })),
      steps: (d.steps || []).map((it, i) => ({ ...it, _key: `s-${i}` })),
    });
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
  },

  onSummaryInput(e: WechatMiniprogram.Input) {
    this.setData({ summary: e.detail.value });
  },

  onMinutesInput(e: WechatMiniprogram.Input) {
    this.setData({ totalMinutes: Number(e.detail.value) || 0 });
  },

  onDifficultyTap(e: WechatMiniprogram.BaseEvent) {
    const v = Number((e.currentTarget as unknown as { dataset: { v: string } }).dataset.v);
    this.setData({ difficulty: v });
  },

  onIngNameInput(e: WechatMiniprogram.Input) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const arr = this.data.ingredients.slice();
    arr[idx] = { ...arr[idx], name: e.detail.value };
    this.setData({ ingredients: arr });
  },

  onIngAmountInput(e: WechatMiniprogram.Input) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const arr = this.data.ingredients.slice();
    arr[idx] = { ...arr[idx], amount_text: e.detail.value };
    this.setData({ ingredients: arr });
  },

  onAddIngredient() {
    this.setData({
      ingredients: [
        ...this.data.ingredients,
        { _key: `i-${Date.now()}`, name: '', amount_text: '' },
      ],
    });
  },

  onRemoveIngredient(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    this.setData({ ingredients: this.data.ingredients.filter((_, i) => i !== idx) });
  },

  onStepDescInput(e: WechatMiniprogram.Input) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const arr = this.data.steps.slice();
    arr[idx] = { ...arr[idx], description: e.detail.value };
    this.setData({ steps: arr });
  },

  onAddStep() {
    this.setData({
      steps: [
        ...this.data.steps,
        { _key: `s-${Date.now()}`, description: '' },
      ],
    });
  },

  onRemoveStep(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    this.setData({ steps: this.data.steps.filter((_, i) => i !== idx) });
  },

  async onSave() {
    const title = this.data.title.trim();
    if (!title) {
      wx.showToast({ title: '请输入菜谱标题', icon: 'none' });
      return;
    }
    const ingredients = this.data.ingredients
      .filter(i => i.name?.trim())
      .map(({ _key, ...rest }) => rest);
    const steps = this.data.steps
      .filter(s => s.description?.trim())
      .map(({ _key, ...rest }) => rest);
    if (!ingredients.length) {
      wx.showToast({ title: '至少 1 个食材', icon: 'none' });
      return;
    }
    if (!steps.length) {
      wx.showToast({ title: '至少 1 个步骤', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const res = await recipeApi.createDraft({
        title,
        summary: this.data.summary.trim() || undefined,
        cover_image_url: this.data.coverImageUrl || undefined,
        total_minutes: this.data.totalMinutes,
        difficulty: this.data.difficulty,
        ingredients,
        steps,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/recipes/detail/index?id=${res.detail.recipe.id}` });
      }, 600);
    } catch (e) {
      console.error('[editor] save fail', e);
    } finally {
      this.setData({ saving: false });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },
});
