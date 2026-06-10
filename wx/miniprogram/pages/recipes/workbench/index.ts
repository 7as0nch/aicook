// 菜谱工作台：文本/图片/语音三种入口 → AI 生成菜谱草稿 → 跳编辑页
import { chatStore } from '../../../store/chat.store';
import { aiApi } from '../../../services/ai.api';
import { importApi } from '../../../services/import.api';
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
    recipeDraft: null as Record<string, unknown> | null,
    recording: false,
  },

  _dispose: null as IReactionDisposer | null,

  onLoad() {
    chatStore.reset();
    // 监听 chat.store 的最新 assistant 消息
    this._dispose = autorun(() => {
      const last = chatStore.messages[chatStore.messages.length - 1];
      if (!last) return;
      this.applyMessageState(last);
    });
  },

  onUnload() {
    this._dispose?.();
  },

  applyMessageState(msg: ChatMessage) {
    let answerPreview = '';
    let statusLabel = '';
    let draft: Record<string, unknown> | null = null;
    for (const seg of msg.segments) {
      if (seg.kind === 'text') answerPreview = seg.content.slice(0, 300);
      else if (seg.kind === 'status') statusLabel = seg.message;
      else if (seg.kind === 'agent') statusLabel = seg.content;
      else if (seg.kind === 'recipe_card' && seg.draft) draft = seg.draft;
    }
    this.setData({
      streaming: msg.status === 'streaming',
      statusLabel,
      answerPreview,
      recipeDraft: draft,
    });
    // 收到草稿且流结束 → 跳编辑页
    if (draft && msg.status === 'done') {
      const json = encodeURIComponent(JSON.stringify(draft));
      wx.navigateTo({ url: `/pages/recipes/editor/index?draft=${json}` });
    }
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
      chatStore.send(text || '请根据图片识别食材并生成菜谱', {
        scene: 'recipe_workbench',
        attachments,
      });
    } catch (e) {
      wx.showToast({ title: '发送失败', icon: 'none' });
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
    }
  },

  async onVoiceTap() {
    if (this.data.recording) return;
    const rm = wx.getRecorderManager();
    try {
      this.setData({ recording: true });
      rm.start({ duration: 30000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' });
      setTimeout(async () => {
        const res = await new Promise<{ tempFilePath?: string } | null>((resolve) => {
          rm.onStop((r: unknown) => resolve(r as { tempFilePath?: string }));
          rm.onError(() => resolve(null));
          rm.stop();
        });
        this.setData({ recording: false });
        const path = res?.tempFilePath;
        if (!path) return;
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
        }
      }, 3000);
    } catch (e) {
      this.setData({ recording: false });
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
    if (job.status === 'success' || job.status === 'failed') {
      return {
        status: job.status,
        recipe_id: job.recipe_id ? String(job.recipe_id) : undefined,
        error_message: job.error_message,
      };
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return { status: 'timeout' };
}
