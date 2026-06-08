// AI 全屏聊天页（设计稿 05 全屏变体）
// 复用 chatStore 的 SSE 流；展示用户/助理消息、reasoning 段、tool_call、recipe_card
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { chatStore } from '../../../store/chat.store';
import { aiApi } from '../../../services/ai.api';
import { voiceApi } from '../../../services/voice.api';
import { uploadFile } from '../../../services/upload';
import type { ChatMessage } from '../../../types/chat';

interface QuickAction { id: 'find' | 'how' | 'snap' | 'voice'; iconSrc: string; label: string; desc: string; }

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'find', iconSrc: '/assets/icons/search.png', label: '找菜谱', desc: '按食材搜索' },
  { id: 'how', iconSrc: '/assets/icons/help.png', label: '问做法', desc: '步骤与技巧' },
  { id: 'snap', iconSrc: '/assets/icons/camera.png', label: '识别食材', desc: '拍照即得' },
  { id: 'voice', iconSrc: '/assets/icons/mic.svg', label: '语音问答', desc: '解放双手' },
];

const SUGGESTIONS = [
  '用土豆和鸡蛋能做什么菜？',
  '微辣下饭的家常菜推荐一下',
  '怎样炖牛腩才更软更入味？',
];

Page({
  data: {
    sessionId: '' as string,
    text: '',
    messages: [] as ChatMessage[],
    streaming: false,
    reasoningEnabled: false,
    webSearchEnabled: false,
    imageRecipeEnabled: false,
    scrollToView: '',
    recording: false,
    quickActions: QUICK_ACTIONS,
    suggestions: SUGGESTIONS,
  },

  async onLoad(query: Record<string, string>) {
    this.setData({ sessionId: query.session_id || '' });
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings = createStoreBindings(this, {
      store: chatStore,
      fields: ['messages', 'streaming', 'reasoningEnabled', 'webSearchEnabled', 'imageRecipeEnabled'] as const,
      actions: [] as const,
    });
    if (query.session_id) {
      try {
        await chatStore.loadHistory(query.session_id);
      } catch (e) {
        wx.showToast({ title: '加载历史失败', icon: 'none' });
      }
    } else if (!chatStore.session) {
      try {
        const reply = await aiApi.createSession({ scene: 'chat', title: '厨艺助理' });
        chatStore.setSession(reply.session);
      } catch {
        // 静默失败：让用户在发送时再触发
      }
    }
    this.scrollToBottom();
  },

  onUnload() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings?.destroyStoreBindings();
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ text: e.detail.value });
  },

  scrollToBottom() {
    setTimeout(() => {
      const last = this.data.messages[this.data.messages.length - 1];
      if (last) this.setData({ scrollToView: `m-${last.client_id}` });
    }, 80);
  },

  async ensureSession() {
    if (chatStore.session) return;
    const reply = await aiApi.createSession({ scene: 'chat', title: '厨艺助理' });
    chatStore.setSession(reply.session);
  },

  async onSendTap() {
    const text = this.data.text.trim();
    if (!text) return;
    try {
      await this.ensureSession();
      chatStore.send(text);
      this.setData({ text: '' });
      this.scrollToBottom();
    } catch {
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  onAbort() {
    chatStore.abort();
  },

  onBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/home/index/index' });
    }
  },

  onOpenHistory() {
    // 历史会话改成 ai-sheet 内浮窗了；这里保留按钮入口但直接返回浮球
    wx.showToast({ title: '请使用浮球内的历史按钮', icon: 'none' });
  },

  async onNew() {
    chatStore.reset();
    try {
      const reply = await aiApi.createSession({ scene: 'chat', title: '厨艺助理' });
      chatStore.setSession(reply.session);
      wx.showToast({ title: '已开新会话', icon: 'success' });
    } catch {
      wx.showToast({ title: '新建会话失败', icon: 'none' });
    }
  },

  onQuickTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: QuickAction['id'] } }).dataset.id;
    switch (id) {
      case 'find':
        this.setData({ text: '我有 _ 和 _，能做什么菜？' });
        break;
      case 'how':
        this.setData({ text: '怎样做 _ 更好吃？' });
        break;
      case 'snap':
        wx.navigateTo({ url: '/pages/recipes/snap/index' });
        break;
      case 'voice':
        this.onMicTap();
        break;
    }
  },

  onSuggestionTap(e: WechatMiniprogram.BaseEvent) {
    const text = (e.currentTarget as unknown as { dataset: { text: string } }).dataset.text;
    if (text) {
      this.setData({ text });
      this.onSendTap();
    }
  },

  onToggleReasoning() { chatStore.toggleReasoning(); },
  onToggleWebSearch() { chatStore.toggleWebSearch(); },
  onToggleImageRecipe() { chatStore.toggleImageRecipe(); },

  async onMicTap() {
    if (this.data.recording) return;
    const rm = wx.getRecorderManager();
    try {
      await new Promise<void>((resolve) => {
        rm.onStart(() => resolve());
        rm.onError(() => resolve());
        rm.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' });
      });
      this.setData({ recording: true });
      // 简化版：3s 自动停止
      setTimeout(async () => {
        const res = await new Promise<{ tempFilePath?: string } | null>((resolve) => {
          rm.onStop((r: unknown) => resolve(r as { tempFilePath?: string }));
          rm.onError(() => resolve(null));
          rm.stop();
        });
        this.setData({ recording: false });
        const path = res?.tempFilePath;
        if (!path) return;
        try {
          const info = await new Promise<{ size: number }>((resolve) => {
            (wx as any).getFileInfo({ filePath: path, success: (r: { size: number }) => resolve({ size: r.size }), fail: () => resolve({ size: 0 }) });
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
            this.onSendTap();
          }
        } catch (e) {
          wx.showToast({ title: '语音识别失败', icon: 'none' });
        }
      }, 3000);
    } catch (e) {
      this.setData({ recording: false });
    }
  },

  onRecipeCardTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (id) wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },
});
