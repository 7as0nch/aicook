// 菜谱工作台：文本/图片/语音三种入口 → AI 生成菜谱草稿 → 跳编辑页
import { chatStore } from '../../../store/chat.store';
import { aiApi } from '../../../services/ai.api';
import { importApi, isImportJobDone, isImportJobFailed } from '../../../services/import.api';
import { voiceApi } from '../../../services/voice.api';
import { pickMedia, uploadFile } from '../../../services/upload';
import { autorun, IReactionDisposer } from 'mobx-miniprogram';
import type { ChatMessage } from '../../../types/chat';

interface UploadedImage { url: string; asset_id: string; }

Page({
  data: {
    text: '',
    images: [] as UploadedImage[],
    streaming: false,
    statusLabel: '',
    answerPreview: '',
    errorText: '',
    recipeDraft: null as Record<string, unknown> | null,
    recording: false,
    recordSeconds: 0,
  },

  _dispose: null as IReactionDisposer | null,

  onLoad() {
    chatStore.reset();
    this.initRecorder();
    // 监听 chat.store 的最新 assistant 消息
    this._dispose = autorun(() => {
      const last = chatStore.messages[chatStore.messages.length - 1];
      if (!last) return;
      this.applyMessageState(last);
    });
  },

  onUnload() {
    this._dispose?.();
    if (this.data.recording) {
      wx.getRecorderManager().stop();
    }
    this.clearRecordTimer();
  },

  applyMessageState(msg: ChatMessage) {
    let answerPreview = '';
    let statusLabel = '';
    let errorText = '';
    let draft: Record<string, unknown> | null = null;
    let pendingApproval = false;
    for (const seg of msg.segments) {
      if (seg.kind === 'text') answerPreview = seg.content.slice(0, 300);
      else if (seg.kind === 'status') statusLabel = seg.message;
      else if (seg.kind === 'agent') statusLabel = seg.content;
      else if (seg.kind === 'recipe_card' && seg.draft) draft = seg.draft;
      else if (seg.kind === 'error') errorText = seg.message;
      else if (seg.kind === 'approval' && !seg.answered) pendingApproval = true;
    }
    this.setData({
      streaming: msg.status === 'streaming',
      statusLabel,
      answerPreview,
      // 出错时必须给用户反馈（之前 error 段被忽略，失败后页面毫无反应）
      errorText,
      recipeDraft: draft,
    });
    // AI 需要用户补充选择（human-in-loop）：打开助理抽屉作答（共享同一会话），
    // 否则工作流会停在等待选择上、页面看起来"卡住"
    if (pendingApproval && msg.status === 'done') {
      const self = this as unknown as { _approvalPrompted?: string };
      if (self._approvalPrompted !== msg.client_id) {
        self._approvalPrompted = msg.client_id;
        this.setData({ statusLabel: '需要你补充几个选择…' });
        chatStore.openSheet({ scene: 'recipe_workbench' });
      }
    }
    // 收到草稿且流结束 → 跳编辑页
    if (draft && msg.status === 'done') {
      const json = encodeURIComponent(JSON.stringify(draft));
      wx.navigateTo({ url: `/pages/recipes/editor/index?draft=${json}` });
    }
  },

  // 错误条上的重试：直接重新提交当前输入
  onRetry() {
    this.setData({ errorText: '' });
    void this.onSubmit();
  },

  // 手动创建：跳编辑页空表单
  onManualCreate() {
    wx.navigateTo({ url: '/pages/recipes/editor/index' });
  },

  onTextInput(e: WechatMiniprogram.Input) {
    this.setData({ text: e.detail.value });
  },

  async onSubmit() {
    const text = this.data.text.trim();
    if (!text && !this.data.images.length) {
      wx.showToast({ title: '请输入或上传食材', icon: 'none' });
      return;
    }
    try {
      // 确保有 session（场景：recipe_workbench）
      if (!chatStore.session) {
        const reply = await aiApi.createSession({ scene: 'recipe_workbench', title: '生成菜谱' });
        chatStore.setSession(reply.session);
      }
      const attachments = this.data.images.map(img => ({
        type: 'image',
        url: img.url,
        asset_id: img.asset_id,
        content_type: 'image/jpeg',
      }));
      // 强制开启 image_recipe 模式（若有图片）
      if (attachments.length > 0 && !chatStore.imageRecipeEnabled) {
        chatStore.toggleImageRecipe();
      }
      this.setData({ errorText: '' });
      chatStore.send(text || '请根据图片识别食材并生成菜谱', {
        scene: 'recipe_workbench',
        attachments,
      });
    } catch (e) {
      console.error('[workbench] submit fail', e);
      wx.showToast({ title: '发送失败，请重试', icon: 'none' });
    }
  },

  async onPickImage() {
    try {
      const res = await pickMedia({ mediaKind: 'image', count: 4, sourceType: ['album', 'camera'] });
      const files = res.tempFiles || [];
      for (const f of files) {
        try {
          const asset = await uploadFile({
            tempFilePath: f.tempFilePath,
            mediaKind: 'image',
            contentType: 'image/jpeg',
            sizeBytes: f.size || 0,
          });
          // proto MediaAsset 的字段是 storage_url（预签名访问地址），不存在 url 字段；
          // 兜底用本地临时路径做即时预览
          this.setData({
            images: [...this.data.images, { url: asset.storage_url || f.tempFilePath, asset_id: String(asset.id) }],
          });
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      }
    } catch (e) {
      // 用户取消
    }
  },

  onRemoveImage(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    this.setData({ images: this.data.images.filter((_, i) => i !== idx) });
  },

  async onSnapImport() {
    // 直接调 importApi 异步识别
    try {
      const res = await pickMedia({ mediaKind: 'image', count: 1, sourceType: ['camera'] });
      const f = res.tempFiles?.[0];
      if (!f) return;
      const asset = await uploadFile({
        tempFilePath: f.tempFilePath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: f.size || 0,
      });
      wx.showLoading({ title: '识别中', mask: true });
      const jobRes = await importApi.createImageRecipe([String(asset.id)], this.data.text || '');
      const final = await pollJob(String(jobRes.job.id));
      wx.hideLoading();
      if (final.recipe_id) {
        wx.redirectTo({ url: `/pages/recipes/detail/index?id=${final.recipe_id}` });
      } else if (final.status === 'failed') {
        wx.showToast({ title: final.error_message || '识别失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('[workbench] snap fail', e);
      const msg = (e as { message?: string })?.message || '拍照识别失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  // ===== 语音输入：点按开始 → 再点停止（上限 60s 自动停），识别结果填入输入框 =====

  initRecorder() {
    // RecorderManager 是全局单例，onLoad 时注册一次回调，避免重复叠加
    const rm = wx.getRecorderManager();
    rm.onStart(() => {
      this.setData({ recording: true, recordSeconds: 0 });
      const self = this as unknown as { _recTimer?: ReturnType<typeof setInterval> };
      self._recTimer = setInterval(() => {
        this.setData({ recordSeconds: this.data.recordSeconds + 1 });
      }, 1000);
    });
    rm.onStop((res) => {
      void this.handleRecordStop(res as { tempFilePath?: string; duration?: number });
    });
    rm.onError(() => {
      this.clearRecordTimer();
      this.setData({ recording: false, recordSeconds: 0 });
      wx.showToast({ title: '录音失败，请检查麦克风权限', icon: 'none' });
    });
  },

  clearRecordTimer() {
    const self = this as unknown as { _recTimer?: ReturnType<typeof setInterval> };
    if (self._recTimer) {
      clearInterval(self._recTimer);
      self._recTimer = undefined;
    }
  },

  onVoiceTap() {
    const rm = wx.getRecorderManager();
    if (this.data.recording) {
      rm.stop();
      return;
    }
    rm.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' });
  },

  async handleRecordStop(res: { tempFilePath?: string; duration?: number }) {
    this.clearRecordTimer();
    this.setData({ recording: false, recordSeconds: 0 });
    const path = res?.tempFilePath;
    if (!path) return;
    if (res.duration !== undefined && res.duration < 600) {
      wx.showToast({ title: '说话时间太短', icon: 'none' });
      return;
    }
    try {
      const info = await new Promise<{ size: number }>((resolve) => {
        wx.getFileSystemManager().getFileInfo({
          filePath: path,
          success: (r) => resolve({ size: r.size }),
          fail: () => resolve({ size: 0 }),
        });
      });
      const asset = await uploadFile({
        tempFilePath: path,
        mediaKind: 'audio',
        contentType: 'audio/mpeg',
        sizeBytes: info.size,
      });
      const tr = await voiceApi.transcribe(String(asset.id));
      const t = (tr.text || '').trim();
      if (t) {
        this.setData({ text: t });
      } else {
        wx.showToast({ title: '没有识别到内容', icon: 'none' });
      }
    } catch (e) {
      console.error('[workbench] voice transcribe fail', e);
      wx.showToast({ title: '语音识别失败，请重试', icon: 'none' });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },
});

async function pollJob(jobId: string, interval = 1500, timeout = 60000): Promise<{ status: string; recipe_id?: string; error_message?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await importApi.getImportJob(jobId);
    const job = res.job;
    // 注意：后端成功时状态是 review_required（草稿待确认），不是 success
    if (isImportJobDone(job.status) || isImportJobFailed(job.status)) {
      return {
        status: isImportJobFailed(job.status) ? 'failed' : 'success',
        recipe_id: job.recipe_id ? String(job.recipe_id) : undefined,
        error_message: job.error_message,
      };
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return { status: 'timeout' };
}
