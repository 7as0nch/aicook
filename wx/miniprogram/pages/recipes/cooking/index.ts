// 烹饪流程页：步骤导航 + 倒计时 + AI 引用
import { recipeApi } from '../../../services/recipe.api';
import { cookingApi } from '../../../services/cooking.api';
import { kitchenApi } from '../../../services/kitchen.api';
import { emit, EVENTS } from '../../../utils/eventbus';
import type { RecipeStep, RecipeDetail } from '../../../types/api';

Page({
  data: {
    recipeId: '' as string,
    detail: null as RecipeDetail | null,
    stepIndex: 0,
    totalSteps: 0,
    currentStep: null as RecipeStep | null,
    timerTotalSeconds: 0,
    timerRemaining: 0,
    timerRunning: false,
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
      this.setData({
        detail,
        stepIndex,
        totalSteps,
        currentStep: step,
        timerTotalSeconds: timerTotal,
        timerRemaining: active?.remaining_seconds ?? timerTotal,
        timerRunning: !!active?.timer_running,
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

  startCountdown() {
    this.clearTimer();
    if (this.data.timerRemaining <= 0) return;
    this._timer = setInterval(() => {
      const remaining = this.data.timerRemaining - 1;
      if (remaining <= 0) {
        this.clearTimer();
        this.setData({ timerRemaining: 0, timerRunning: false });
        wx.vibrateLong();
        wx.showToast({ title: '时间到', icon: 'success' });
      } else {
        this.setData({ timerRemaining: remaining });
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

  onPrev() {
    if (this.data.stepIndex <= 0) return;
    const stepIndex = this.data.stepIndex - 1;
    this.gotoStep(stepIndex);
  },

  onNext() {
    if (this.data.stepIndex >= this.data.totalSteps - 1) {
      this.onComplete();
      return;
    }
    const stepIndex = this.data.stepIndex + 1;
    this.gotoStep(stepIndex);
  },

  gotoStep(stepIndex: number) {
    this.clearTimer();
    const step = this.data.detail?.steps?.[stepIndex] || null;
    const timerTotal = step?.timer_seconds || 0;
    this.setData({
      stepIndex,
      currentStep: step,
      timerTotalSeconds: timerTotal,
      timerRemaining: timerTotal,
      timerRunning: false,
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
    emit(EVENTS.AI_OPEN, {
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
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },
});
