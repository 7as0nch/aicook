// AI 全屏聊天页（设计稿 05 全屏变体）
// 复用 chatStore 的 SSE 流；展示用户/助理消息、reasoning 段、tool_call、recipe_card
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { chatStore } from '../../../store/chat.store';
import { aiApi } from '../../../services/ai.api';
import { voiceApi } from '../../../services/voice.api';
import { uploadFile } from '../../../services/upload';
import type { ApprovalSegment, ChatMessage } from '../../../types/chat';

// 从 store 中按消息 client_id + 审批 id 找到 approval 段（交互回调用）
function findApprovalSeg(msgClientId: string, approvalId: string): ApprovalSegment | undefined {
  const msg = chatStore.messages.find((m) => m.client_id === msgClientId);
  return msg?.segments.find(
    (s): s is ApprovalSegment => s.kind === 'approval' && s.approval_id === approvalId,
  );
}

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
    recordSeconds: 0,
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
        // 创建失败要让用户知道（发送时 ensureSession 会重试，不阻断流程）
        wx.showToast({ title: '会话创建失败，发送时将自动重试', icon: 'none' });
      }
    }
    this.initRecorder();
    this.scrollToBottom();
  },

  onUnload() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings?.destroyStoreBindings();
    if (this.data.recording) {
      wx.getRecorderManager().stop();
    }
    this.clearRecordTimer();
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

  // ===== 语音输入：点按开始 → 再点停止（上限 60s 自动停），识别失败可重试 =====

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

  onMicTap() {
    const rm = wx.getRecorderManager();
    if (this.data.recording) {
      // 再次点击：停止录音，onStop 回调统一走识别流程
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
    await this.transcribeAudio(path);
  },

  // 上传 + 识别；失败弹窗提供重试（录音文件还在临时目录，无需重录）
  async transcribeAudio(path: string) {
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
        void this.onSendTap();
      } else {
        wx.showToast({ title: '没有识别到内容', icon: 'none' });
      }
    } catch (e) {
      wx.showModal({
        title: '语音识别失败',
        content: '网络或服务异常，是否重试？',
        confirmText: '重试',
        cancelText: '放弃',
        success: (r) => {
          if (r.confirm) void this.transcribeAudio(path);
        },
      });
    }
  },

  // 卡片点击：已落库（有 recipe_id）→ 详情页；仅草稿 → 编辑页保存；都没有 → 提示
  onRecipeCardTap(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { id?: string; cid?: string; idx?: string } }).dataset;
    if (ds.id) {
      wx.navigateTo({ url: `/pages/recipes/detail/index?id=${ds.id}` });
      return;
    }
    const msg = chatStore.messages.find((m) => m.client_id === ds.cid);
    const seg = msg?.segments[Number(ds.idx)];
    if (seg && seg.kind === 'recipe_card' && seg.draft) {
      const json = encodeURIComponent(JSON.stringify(seg.draft));
      wx.navigateTo({ url: `/pages/recipes/editor/index?draft=${json}` });
      return;
    }
    wx.showToast({ title: '草稿数据缺失，请重新生成', icon: 'none' });
  },

  // 思考过程展开/收起
  onReasonToggle(e: WechatMiniprogram.BaseEvent) {
    const cid = (e.currentTarget as unknown as { dataset: { cid?: string } }).dataset.cid;
    if (cid) chatStore.toggleReasoningCollapsed(cid);
  },

  // 工作流时间线展开/收起
  onFlowToggle(e: WechatMiniprogram.BaseEvent) {
    const cid = (e.currentTarget as unknown as { dataset: { cid?: string } }).dataset.cid;
    if (cid) chatStore.toggleFlowCollapsed(cid);
  },

  // human-in-loop：single 模式点选即提交；multi 模式本地勾选
  onApprovalOptionTap(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { cid?: string; aid?: string; oid?: string } }).dataset;
    if (!ds.cid || !ds.aid || !ds.oid) return;
    const seg = findApprovalSeg(ds.cid, ds.aid);
    if (!seg || seg.answered) return;
    if (seg.selection_mode === 'multi') {
      chatStore.toggleApprovalChoice(ds.cid, ds.aid, ds.oid);
      return;
    }
    const opt = (seg.options || []).find((o) => o.id === ds.oid);
    if (opt) chatStore.sendApproval(ds.cid, ds.aid, [opt]);
  },

  onApprovalConfirm(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { cid?: string; aid?: string } }).dataset;
    if (!ds.cid || !ds.aid) return;
    const seg = findApprovalSeg(ds.cid, ds.aid);
    if (!seg || seg.answered) return;
    const chosen = (seg.options || []).filter((o) => seg.selected_map?.[o.id]);
    if (!chosen.length) {
      wx.showToast({ title: '请先选择', icon: 'none' });
      return;
    }
    chatStore.sendApproval(ds.cid, ds.aid, chosen);
  },

  onApprovalSkip(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { cid?: string; aid?: string } }).dataset;
    if (!ds.cid || !ds.aid) return;
    const seg = findApprovalSeg(ds.cid, ds.aid);
    if (!seg || seg.answered) return;
    chatStore.sendApproval(ds.cid, ds.aid, [], false);
  },
});
