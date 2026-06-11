// 烹饪流程页：分步导航 + 倒计时模式 + 多媒体步骤 + AI 引用
import { recipeApi } from '../../../services/recipe.api';
import { cookingApi } from '../../../services/cooking.api';
import { kitchenApi } from '../../../services/kitchen.api';
import { chatStore } from '../../../store/chat.store';
import type { RecipeStep, RecipeDetail } from '../../../types/api';

// step_type 英文枚举 → 中文标签（AI 草稿可能已是中文，未命中则原样展示）
const STEP_TYPE_LABEL: Record<string, string> = {
  prep: '预处理',
  prepare: '预处理',
  cook: '烹饪',
  cooking: '烹饪',
  fry: '翻炒',
  boil: '炖煮',
  stew: '炖煮',
  rest: '静置',
  cool: '放凉',
  plate: '装盘',
  season: '调味',
};

interface StepView {
  mediaList: string[];
  tags: string[];
}

function decorateStep(step: RecipeStep | null): StepView {
  if (!step) return { mediaList: [], tags: [] };
  const mediaList = (step.media_urls && step.media_urls.length
    ? step.media_urls
    : step.media_url ? [step.media_url] : []).filter(Boolean);
  const tags: string[] = [];
  const st = (step.step_type || '').trim();
  if (st) tags.push(STEP_TYPE_LABEL[st.toLowerCase()] || st);
  if (step.heat_level) tags.push(step.heat_level);
  if (step.need_timer || step.timer_seconds) tags.push('需计时');
  return { mediaList, tags };
}

Page({
  data: {
    recipeId: '' as string,
    detail: null as RecipeDetail | null,
    stepIndex: 0,
    totalSteps: 0,
    currentStep: null as RecipeStep | null,
    // 多媒体步骤
    mediaList: [] as string[],
    mediaIndex: 0,
    stepTags: [] as string[],
    // 倒计时
    timerTotalSeconds: 0,
    timerRemaining: 0,
    timerRunning: false,
    timerText: '00:00',
    timerProgress: 0,        // 0~100，圆环进度
    startedAtMs: 0,
    completedStepCount: 0,
  },

  _timer: null as ReturnType<typeof setInterval> | null,

  async onLoad(query: Record<string, string>) {
    const recipeId = query.id || '';
    this.setData({ recipeId, startedAtMs: Date.now() });
    try {
      const [detailRes, activeRes] = await Promise.all([
        recipeApi.detail(recipeId),
        cookingApi.listActive().catch(() => ({ items: [] })),
      ]);
      const detail = detailRes.detail;
      const active = activeRes.items?.find(a => String(a.recipe_id) === String(recipeId));
      const stepIndex = active?.step_index || 0;
      const totalSteps = detail.steps?.length || 0;
      const step = detail.steps?.[stepIndex] || null;
      const timerTotal = step?.timer_seconds || 0;
      const remaining = active?.remaining_seconds ?? timerTotal;
      const view = decorateStep(step);
      this.setData({
        detail,
        stepIndex,
        totalSteps,
        currentStep: step,
        mediaList: view.mediaList,
        mediaIndex: 0,
        stepTags: view.tags,
        timerTotalSeconds: timerTotal,
        timerRemaining: remaining,
        timerRunning: !!active?.timer_running,
        timerText: this.formatTime(remaining),
        timerProgress: timerTotal > 0 ? ((timerTotal - remaining) / timerTotal) * 100 : 0,
      });
      if (active?.timer_running) {
        this.startCountdown();
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onUnload() {
    this.clearTimer();
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  // 统一刷新倒计时文案 + 圆环进度
  syncTimerView(remaining: number) {
    const total = this.data.timerTotalSeconds;
    this.setData({
      timerRemaining: remaining,
      timerText: this.formatTime(remaining),
      timerProgress: total > 0 ? ((total - remaining) / total) * 100 : 0,
    });
  },

  startCountdown() {
    this.clearTimer();
    if (this.data.timerRemaining <= 0) return;
    this._timer = setInterval(() => {
      const remaining = this.data.timerRemaining - 1;
      if (remaining <= 0) {
        this.clearTimer();
        this.setData({ timerRunning: false });
        this.syncTimerView(0);
        wx.vibrateLong();
        wx.showToast({ title: '时间到', icon: 'success' });
      } else {
        this.syncTimerView(remaining);
      }
    }, 1000);
  },

  onPlayPause() {
    if (!this.data.currentStep?.timer_seconds) return;
    const running = !this.data.timerRunning;
    this.setData({ timerRunning: running });
    if (running) {
      this.startCountdown();
    } else {
      this.clearTimer();
    }
    void this.saveProgress();
  },

  // 延长 1 分钟（同步扩展总时长，保证圆环比例正确）
  onExtendMinute() {
    const remaining = this.data.timerRemaining + 60;
    const total = Math.max(this.data.timerTotalSeconds + 60, remaining);
    this.setData({ timerTotalSeconds: total });
    this.syncTimerView(remaining);
    void this.saveProgress();
  },

  onSelectMedia(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    if (!Number.isNaN(idx)) this.setData({ mediaIndex: idx });
  },

  onPreviewMedia() {
    const urls = this.data.mediaList;
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[this.data.mediaIndex] });
  },

  onPrev() {
    if (this.data.stepIndex <= 0) return;
    this.gotoStep(this.data.stepIndex - 1);
  },

  onNext() {
    if (this.data.stepIndex >= this.data.totalSteps - 1) {
      this.onComplete();
      return;
    }
    this.gotoStep(this.data.stepIndex + 1);
  },

  gotoStep(stepIndex: number) {
    this.clearTimer();
    const step = this.data.detail?.steps?.[stepIndex] || null;
    const timerTotal = step?.timer_seconds || 0;
    const view = decorateStep(step);
    this.setData({
      stepIndex,
      currentStep: step,
      mediaList: view.mediaList,
      mediaIndex: 0,
      stepTags: view.tags,
      timerTotalSeconds: timerTotal,
      timerRemaining: timerTotal,
      timerRunning: false,
      timerText: this.formatTime(timerTotal),
      timerProgress: 0,
      completedStepCount: Math.max(this.data.completedStepCount, stepIndex),
    });
    void this.saveProgress();
  },

  async saveProgress() {
    if (!this.data.recipeId) return;
    try {
      await cookingApi.upsertActive({
        recipe_id: this.data.recipeId,
        step_index: this.data.stepIndex,
        total_steps: this.data.totalSteps,
        timer_total_seconds: this.data.timerTotalSeconds,
        timer_started_at_ms: this.data.timerRunning ? Date.now() : 0,
        timer_paused_remaining: this.data.timerRemaining,
      });
    } catch (e) {
      // 静默
    }
  },

  onAskAI() {
    // 弹 ai-sheet 带步骤上下文
    chatStore.openSheet({
      scene: 'cooking_guide',
      recipe_id: this.data.recipeId,
      quote_context: {
        selected_text: this.data.currentStep?.description || '',
        surrounding_text: `第 ${this.data.stepIndex + 1} 步：${this.data.currentStep?.title || ''}\n${this.data.currentStep?.description || ''}`,
        scene: 'cooking',
        selection_source: `cooking/${this.data.recipeId}`,
      },
    });
  },

  async onComplete() {
    this.clearTimer();
    const duration = Math.floor((Date.now() - this.data.startedAtMs) / 1000);
    try {
      await kitchenApi.createCookingHistory({
        recipe_id: this.data.recipeId,
        started_at_ms: this.data.startedAtMs,
        completed_at_ms: Date.now(),
        duration_seconds: duration,
        completed_step_count: this.data.totalSteps,
      });
      await cookingApi.deleteActive(this.data.recipeId).catch(() => undefined);
      wx.showToast({ title: '完成 +1 道', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onExit() {
    wx.showModal({
      title: '退出烹饪',
      content: '保留进度下次继续？',
      confirmText: '保留',
      cancelText: '放弃',
      success: async (res) => {
        if (res.confirm) {
          await this.saveProgress();
        } else if (res.cancel) {
          await cookingApi.deleteActive(this.data.recipeId).catch(() => undefined);
        }
        wx.navigateBack({ delta: 1 });
      },
    });
  },

  formatTime(s: number): string {
    const safe = Math.max(0, s);
    const m = Math.floor(safe / 60);
    const sec = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },
});
