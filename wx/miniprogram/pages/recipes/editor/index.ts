// 菜谱编辑页：
//   - 创建流：接收 AI 生成的 draft（URL query）→ 编辑 → createDraft 保存为草稿
//   - 编辑流：携带 recipe_id 进入 → 拉详情回填 → update 保存回原菜谱
import { recipeApi, CreateDraftIngredient, CreateDraftStep } from '../../../services/recipe.api';
import { householdApi } from '../../../services/household.api';
import { householdStore } from '../../../store/household.store';
import { pickMedia, uploadFile } from '../../../services/upload';
import type { KitchenTag } from '../../../types/api';

interface DraftIngredient extends CreateDraftIngredient {
  _key?: string;
}

interface DraftStep extends CreateDraftStep {
  _key?: string;
}

interface DraftPayload {
  title?: string;
  summary?: string;
  cover_image_url?: string;
  gallery_image_urls?: string[];
  video_url?: string;
  category?: string;
  total_minutes?: number;
  difficulty?: number;
  scenario_tags?: string[];
  flavor_tags?: string[];
  ingredients?: DraftIngredient[];
  steps?: DraftStep[];
}

const MAX_GALLERY = 9;
// 火候快选项（空 = 不标注）；与烹饪页徽标取值一致
const HEAT_LEVELS = ['小火', '中火', '大火'];

Page({
  data: {
    title: '',
    summary: '',
    // 封面图集：第一张即封面，与步骤配图一样支持多张
    galleryImages: [] as string[],
    galleryUploading: false,
    // 介绍视频（单个）
    videoUrl: '',
    videoUploading: false,
    maxGallery: MAX_GALLERY,
    heatLevels: HEAT_LEVELS,
    // 类目
    category: '',
    tags: [] as KitchenTag[],
    catDialogVisible: false,
    totalMinutes: 30,
    difficulty: 2,
    ingredients: [] as DraftIngredient[],
    steps: [] as DraftStep[],
    saving: false,
    // 输入聚焦时隐藏底部保存条，避免键盘 + 固定条遮挡输入
    typing: false,
    // 非空 = 编辑已有菜谱（保存走 update 而非 createDraft）
    editingId: '',
  },

  onLoad(query: Record<string, string>) {
    void this.loadTags();
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

  // 加载家庭类目（KitchenTag），用于类目选择
  async loadTags() {
    try {
      if (!householdStore.tags?.length) await householdStore.loadTags();
      this.setData({ tags: householdStore.tags.slice() });
    } catch (e) {
      console.warn('[editor] load tags fail', e);
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
        gallery_image_urls: d.recipe.gallery_image_urls,
        video_url: d.recipe.video_url,
        category: d.recipe.category,
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

  hydrate(d: DraftPayload) {
    // 图集：优先用 gallery_image_urls，回退到单封面字段
    let gallery = (d.gallery_image_urls || []).filter(Boolean);
    if (!gallery.length && d.cover_image_url) gallery = [d.cover_image_url];
    this.setData({
      title: d.title || '',
      summary: d.summary || '',
      galleryImages: gallery,
      videoUrl: d.video_url || '',
      category: (d.category || '').trim(),
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

  // 聚焦/失焦：键盘弹起时隐藏底部保存条，避免遮挡
  onInputFocus() {
    if (!this.data.typing) this.setData({ typing: true });
  },
  onInputBlur() {
    if (this.data.typing) this.setData({ typing: false });
  },

  // ===== 封面图集（第一张为封面） =====
  async onAddGalleryImage() {
    if (this.data.galleryUploading) return;
    if (this.data.galleryImages.length >= MAX_GALLERY) {
      wx.showToast({ title: `最多 ${MAX_GALLERY} 张`, icon: 'none' });
      return;
    }
    let file: { tempFilePath: string; size?: number } | undefined;
    try {
      const res = await pickMedia({ mediaKind: 'image', count: 1 });
      file = res.tempFiles?.[0];
    } catch {
      return;
    }
    if (!file) return;
    this.setData({ galleryUploading: true });
    try {
      const asset = await uploadFile({
        tempFilePath: file.tempFilePath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: file.size || 0,
      });
      const url = asset.storage_url;
      if (!url) throw new Error('missing storage_url');
      this.setData({ galleryImages: [...this.data.galleryImages, url] });
    } catch (e) {
      console.error('[editor] gallery upload fail', e);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    } finally {
      this.setData({ galleryUploading: false });
    }
  },

  onRemoveGalleryImage(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    this.setData({ galleryImages: this.data.galleryImages.filter((_, i) => i !== idx) });
  },

  // 将某张设为封面（移到第一位）
  onSetCover(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    if (idx <= 0) return;
    const arr = this.data.galleryImages.slice();
    const [picked] = arr.splice(idx, 1);
    arr.unshift(picked);
    this.setData({ galleryImages: arr });
  },

  // ===== 介绍视频 =====
  async onPickVideo() {
    if (this.data.videoUploading) return;
    let file: { tempFilePath: string; size?: number } | undefined;
    try {
      const res = await pickMedia({ mediaKind: 'video', count: 1 });
      file = res.tempFiles?.[0];
    } catch {
      return;
    }
    if (!file) return;
    this.setData({ videoUploading: true });
    try {
      const asset = await uploadFile({
        tempFilePath: file.tempFilePath,
        mediaKind: 'video',
        contentType: 'video/mp4',
        sizeBytes: file.size || 0,
      });
      this.setData({ videoUrl: asset.storage_url || '' });
    } catch (e) {
      console.error('[editor] video upload fail', e);
      wx.showToast({ title: '视频上传失败', icon: 'none' });
    } finally {
      this.setData({ videoUploading: false });
    }
  },

  onRemoveVideo() {
    this.setData({ videoUrl: '' });
  },

  // ===== 类目 =====
  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const name = String((e.currentTarget as unknown as { dataset: { name: string } }).dataset.name || '');
    // 再次点选已选项 = 取消选择
    this.setData({ category: this.data.category === name ? '' : name });
  },

  onOpenCatDialog() {
    this.setData({ catDialogVisible: true });
  },
  onCatDialogClose() {
    this.setData({ catDialogVisible: false });
  },
  async onCatDialogConfirm(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const name = (e.detail?.value || '').trim();
    if (!name) return;
    this.setData({ catDialogVisible: false });
    // 已存在则直接选中
    if (this.data.tags.some((t) => t.name === name)) {
      this.setData({ category: name });
      return;
    }
    try {
      await householdApi.createKitchenTag(name);
      await householdStore.loadTags();
      this.setData({ tags: householdStore.tags.slice(), category: name });
      wx.showToast({ title: '已新增类目', icon: 'success' });
    } catch (err) {
      console.error('[editor] create tag fail', err);
      wx.showToast({ title: '新增类目失败', icon: 'none' });
    }
  },

  // ===== 食材 =====
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

  // ===== 步骤 =====
  onStepDescInput(e: WechatMiniprogram.Input) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const arr = this.data.steps.slice();
    arr[idx] = { ...arr[idx], description: e.detail.value };
    this.setData({ steps: arr });
  },

  // 步骤计时（秒）：>0 即开启该步的倒计时
  onStepTimerInput(e: WechatMiniprogram.Input) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const seconds = Math.max(0, Math.floor(Number(e.detail.value) || 0));
    const arr = this.data.steps.slice();
    arr[idx] = { ...arr[idx], timer_seconds: seconds || undefined, need_timer: seconds > 0 };
    this.setData({ steps: arr });
  },

  // 步骤预计完成条件（如"土豆软糯，可轻松插入筷子"）
  onStepEndConditionInput(e: WechatMiniprogram.Input) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const arr = this.data.steps.slice();
    arr[idx] = { ...arr[idx], end_condition: e.detail.value };
    this.setData({ steps: arr });
  },

  // 步骤火候快选（再次点选取消）
  onStepHeatTap(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { idx: string; heat: string } }).dataset;
    const idx = Number(ds.idx);
    const heat = String(ds.heat || '');
    const arr = this.data.steps.slice();
    arr[idx] = { ...arr[idx], heat_level: arr[idx].heat_level === heat ? '' : heat };
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

  // 步骤配图：选图 → 两步直传 → 存 storage_url（每步最多 3 张）
  async onStepAddImage(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    if (Number.isNaN(idx) || !this.data.steps[idx]) return;
    let file: { tempFilePath: string; size?: number } | undefined;
    try {
      const res = await pickMedia({ mediaKind: 'image', count: 1 });
      file = res.tempFiles?.[0];
    } catch {
      return;
    }
    if (!file) return;
    wx.showLoading({ title: '上传中', mask: true });
    try {
      const asset = await uploadFile({
        tempFilePath: file.tempFilePath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: file.size || 0,
      });
      const url = asset.storage_url;
      if (!url) throw new Error('missing storage_url');
      const steps = this.data.steps.slice();
      const cur = steps[idx];
      steps[idx] = { ...cur, media_urls: [...(cur.media_urls || []), url] };
      this.setData({ steps });
    } catch (err) {
      console.error('[editor] step image upload fail', err);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onStepRemoveImage(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { idx: string; imgIdx: string } }).dataset;
    const idx = Number(ds.idx);
    const imgIdx = Number(ds.imgIdx);
    const cur = this.data.steps[idx];
    if (!cur) return;
    const steps = this.data.steps.slice();
    steps[idx] = { ...cur, media_urls: (cur.media_urls || []).filter((_, j) => j !== imgIdx) };
    this.setData({ steps });
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
    if (this.data.galleryUploading || this.data.videoUploading) {
      wx.showToast({ title: '媒体上传中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const gallery = this.data.galleryImages.filter(Boolean);
    const payload = {
      title,
      summary: this.data.summary.trim() || undefined,
      cover_image_url: gallery[0] || undefined,
      gallery_image_urls: gallery.length ? gallery : undefined,
      video_url: this.data.videoUrl || undefined,
      category: this.data.category || undefined,
      total_minutes: this.data.totalMinutes,
      difficulty: this.data.difficulty,
      ingredients,
      steps,
    };
    try {
      let recipeId: string;
      if (this.data.editingId) {
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
