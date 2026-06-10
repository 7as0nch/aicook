// 菜谱编辑页：
//   - 创建流：接收 AI 生成的 draft（URL query）→ 编辑 → createDraft 保存为草稿
//   - 编辑流：携带 recipe_id 进入 → 拉详情回填 → update 保存回原菜谱
import { recipeApi, CreateDraftIngredient, CreateDraftStep } from '../../../services/recipe.api';
import { pickMedia, uploadFile } from '../../../services/upload';

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
    coverUploading: false,
    totalMinutes: 30,
    difficulty: 2,
    ingredients: [] as DraftIngredient[],
    steps: [] as DraftStep[],
    saving: false,
    // 非空 = 编辑已有菜谱（保存走 update 而非 createDraft）
    editingId: '',
  },

  onLoad(query: Record<string, string>) {
    if (query.recipe_id) {
      this.setData({ editingId: query.recipe_id });
      void this.loadExisting(query.recipe_id);
      return;
    }
    if (query.draft) {
      try {
        const draft = JSON.parse(decodeURIComponent(query.draft)) as DraftPayload;
        this.hydrate(draft);
      } catch (e) {
        console.error('[editor] parse draft fail', e);
      }
    }
  },

  // 编辑流：拉取已有菜谱详情回填表单
  async loadExisting(id: string) {
    try {
      const res = await recipeApi.detail(id);
      const d = res.detail;
      this.hydrate({
        title: d.recipe.title,
        summary: d.recipe.summary,
        cover_image_url: d.recipe.cover_image_url,
        total_minutes: d.recipe.total_minutes,
        difficulty: d.recipe.difficulty,
        ingredients: (d.ingredients || []).map((it) => ({
          group_name: it.group_name,
          name: it.name,
          amount_text: it.amount_text,
          preparation: it.preparation,
          remark: it.remark,
        })),
        steps: (d.steps || []).map((s) => ({
          title: s.title,
          description: s.description,
          step_type: s.step_type,
          need_timer: s.need_timer,
          timer_seconds: s.timer_seconds,
          timer_animation: s.timer_animation,
          end_condition: s.end_condition,
          heat_level: s.heat_level,
          safety_tips: s.safety_tips,
          ai_hint: s.ai_hint,
          media_url: s.media_url,
          media_urls: s.media_urls,
        })),
      });
    } catch (e) {
      console.error('[editor] load recipe fail', e);
      wx.showToast({ title: '加载菜谱失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  // 封面：选图 → 两步直传 → 存 storage_url（后端读取时会按 host/path 重签）
  async onPickCover() {
    if (this.data.coverUploading) return;
    let file: { tempFilePath: string; size?: number } | undefined;
    try {
      const res = await pickMedia({ mediaKind: 'image', count: 1 });
      file = res.tempFiles?.[0];
    } catch {
      return; // 用户取消选图
    }
    if (!file) return;
    const prevUrl = this.data.coverImageUrl;
    // 先用本地临时路径即时预览，上传成功后换持久地址
    this.setData({ coverUploading: true, coverImageUrl: file.tempFilePath });
    try {
      const asset = await uploadFile({
        tempFilePath: file.tempFilePath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: file.size || 0,
      });
      this.setData({ coverImageUrl: asset.storage_url || file.tempFilePath });
    } catch (e) {
      console.error('[editor] cover upload fail', e);
      this.setData({ coverImageUrl: prevUrl });
      wx.showToast({ title: '封面上传失败', icon: 'none' });
    } finally {
      this.setData({ coverUploading: false });
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
    if (this.data.coverUploading) {
      wx.showToast({ title: '封面上传中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const payload = {
      title,
      summary: this.data.summary.trim() || undefined,
      cover_image_url: this.data.coverImageUrl || undefined,
      total_minutes: this.data.totalMinutes,
      difficulty: this.data.difficulty,
      ingredients,
      steps,
    };
    try {
      let recipeId: string;
      if (this.data.editingId) {
        // 编辑流：更新原菜谱
        const res = await recipeApi.update(this.data.editingId, { id: this.data.editingId, ...payload });
        recipeId = String(res.detail.recipe.id);
      } else {
        const res = await recipeApi.createDraft(payload);
        recipeId = String(res.detail.recipe.id);
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/recipes/detail/index?id=${recipeId}` });
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
