// AI 助理抽屉（厨艺助理 · 设计稿 05）
// 支持：mid (12vh top) ⇄ full (0 top) 两态吸附拖拽；handle 区域下滑关闭/上滑展开
// 不跳页：原"展开"按钮改为内部状态切换，全屏聊天复用同一组件的 expanded 态
import { on, emit, EVENTS } from '../../utils/eventbus';
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { chatStore } from '../../store/chat.store';
import { aiApi } from '../../services/ai.api';
import { voiceApi } from '../../services/voice.api';
import { uploadFile } from '../../services/upload';

interface QuickAction {
  id: 'find' | 'how' | 'snap' | 'voice';
  iconSrc: string;
  label: string;
  desc: string;
}

// 兜底直接操作当前 page 的 tab-bar 实例，避免事件总线在某些时序下失效
function forceTabBar(hidden: boolean): void {
  try {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const tabBar = page && (page as unknown as { getTabBar?: () => { setData: (d: object) => void } | undefined }).getTabBar?.();
    if (tabBar) tabBar.setData({ hidden });
  } catch (_) {
    // 非 tab page 无 tab bar，忽略
  }
}

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

const SCENE_LABEL_MAP: Record<string, string> = {
  chat: '通用对话',
  cooking_guide: '做菜指导',
  recipe_workbench: '菜谱生成',
  recipe_editor: '菜谱编辑',
  recipe_detail: '菜谱讨论',
};

function sceneLabel(scene?: string): string {
  return SCENE_LABEL_MAP[scene || ''] || '对话';
}

function formatTime(t?: string): string {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000));
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

Component({
  options: { multipleSlots: true, addGlobalClass: true },
  properties: {
    context: { type: String, value: '' },
  },
  data: {
    visible: false,
    expanded: false,            // 是否展开到全屏
    dragging: false,            // 是否正在拖拽
    sheetStyle: '',             // 拖拽期间的 inline transform
    text: '',
    quickActions: QUICK_ACTIONS,
    suggestions: SUGGESTIONS,
    recording: false,
    streaming: false,
    reasoningEnabled: false,
    webSearchEnabled: false,
    imageRecipeEnabled: false,
    sending: false,
    scene: '' as string,
    recipeId: undefined as string | undefined,
    quoteContext: null as Record<string, unknown> | null,
    messages: [] as unknown[],
    scrollToView: '',
    // ↓ 历史浮窗
    historyVisible: false,
    historyList: [] as Array<{ id: string; title: string; sceneLabel: string; timeLabel: string }>,
    historyLoading: false,
    // ↓ 上次会话恢复卡
    resumeCard: null as null | { id: string; title: string; timeLabel: string },
  },
  lifetimes: {
    attached() {
      const self = this as unknown as { __unbind?: () => void; storeBindings?: { destroyStoreBindings: () => void } };
      const unbind = on(EVENTS.AI_OPEN, (payload?: unknown) => {
        const p = (payload || {}) as { scene?: string; recipe_id?: string; quote_context?: Record<string, unknown> };
        this.setData({
          visible: true,
          scene: p.scene || '',
          recipeId: p.recipe_id,
          quoteContext: p.quote_context || null,
          // 有历史消息时自动展开
          expanded: chatStore.messages.length > 0,
          historyVisible: false,
        });
        emit(EVENTS.TAB_BAR_HIDE);
        forceTabBar(true);
        this.scrollToBottom();
        // 没有当前 messages 时检测最近会话，提示用户是否继续
        if (chatStore.messages.length === 0) {
          void this.checkResumable();
        }
      });
      self.__unbind = unbind;
      self.storeBindings = createStoreBindings(this, {
        store: chatStore,
        fields: ['streaming', 'reasoningEnabled', 'webSearchEnabled', 'imageRecipeEnabled', 'messages'] as const,
        actions: [] as const,
      });
    },
    detached() {
      const self = this as unknown as { __unbind?: () => void; storeBindings?: { destroyStoreBindings: () => void } };
      self.__unbind?.();
      self.storeBindings?.destroyStoreBindings();
    },
  },
  pageLifetimes: {
    show() {
      // 切回 tab 时，强制关闭 sheet 并恢复 tab bar，避免任何残留
      if (this.data.visible) {
        this.setData({ visible: false, expanded: false });
      }
      emit(EVENTS.TAB_BAR_SHOW);
      forceTabBar(false);
    },
    hide() {
      if (this.data.visible) {
        this.setData({ visible: false, expanded: false });
      }
      emit(EVENTS.TAB_BAR_SHOW);
      forceTabBar(false);
    },
  },
  methods: {
    onClose() {
      this.setData({ visible: false, expanded: false, sheetStyle: '' });
      emit(EVENTS.TAB_BAR_SHOW);
      forceTabBar(false);
    },
    onMaskTap() {
      this.onClose();
    },
    onSheetTap() {},

    // ====== 拖拽（吸附 mid ⇄ full） ======
    onDragStart(e: WechatMiniprogram.TouchEvent) {
      const self = this as unknown as { _touchStartY: number; _touchStartTs: number; _dragOffset: number };
      self._touchStartY = e.touches[0].clientY;
      self._touchStartTs = Date.now();
      self._dragOffset = 0;
      this.setData({ dragging: true });
    },
    onDragMove(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.dragging) return;
      const self = this as unknown as { _touchStartY: number; _dragOffset: number };
      const dy = e.touches[0].clientY - self._touchStartY;
      self._dragOffset = dy;
      // 实时跟手：translateY(dy)；上滑（dy<0）在 mid 状态下可视为预展开，下滑（dy>0）下移
      // 限制：在 expanded 状态下，向上拖无意义（已到顶），夹到 0
      let off = dy;
      if (this.data.expanded && off < 0) off = 0;
      // 在 mid 状态下，限制最大上滑距离（让用户感受到阻力）
      if (!this.data.expanded && off < -160) off = -160 + (off + 160) * 0.2;
      this.setData({ sheetStyle: `transform: translateY(${off}px)` });
    },
    onDragEnd() {
      if (!this.data.dragging) return;
      const self = this as unknown as { _touchStartTs: number; _dragOffset: number };
      const dy = self._dragOffset;
      const duration = Math.max(50, Date.now() - self._touchStartTs);
      const velocity = Math.abs(dy) / duration; // px/ms

      this.setData({ dragging: false, sheetStyle: '' });

      if (this.data.expanded) {
        // 展开态：向下拖 → 缩到 mid；下拖很多 → 直接关闭
        if (dy > 240 || (dy > 80 && velocity > 0.8)) {
          this.onClose();
        } else if (dy > 80 || (dy > 30 && velocity > 0.5)) {
          this.setData({ expanded: false });
        }
      } else {
        // mid 态：向下拖 → 关闭；向上拖 → 展开
        if (dy > 140 || (dy > 50 && velocity > 0.6)) {
          this.onClose();
        } else if (dy < -80 || (dy < -30 && velocity > 0.5)) {
          this.setData({ expanded: true });
          this.scrollToBottom();
        }
      }
    },

    // ====== 头部操作 ======
    onToggleExpand() {
      const expanded = !this.data.expanded;
      this.setData({ expanded });
      if (expanded) this.scrollToBottom();
    },
    onOpenHistory() {
      // 切换历史浮窗显隐（不跳页）
      const willOpen = !this.data.historyVisible;
      this.setData({ historyVisible: willOpen });
      if (willOpen) void this.loadHistorySessions();
    },

    onCloseHistory() {
      this.setData({ historyVisible: false });
    },

    async loadHistorySessions() {
      this.setData({ historyLoading: true });
      try {
        const res = await aiApi.listSessions(undefined, 15);
        const sessions = res.sessions || [];
        const rows = sessions.map((s: { id: string | number; title?: string; scene?: string; updated_at?: string; created_at?: string }) => ({
          id: String(s.id),
          title: s.title || sceneLabel(s.scene) || '对话',
          sceneLabel: sceneLabel(s.scene),
          timeLabel: formatTime(s.updated_at || s.created_at),
        }));
        this.setData({ historyList: rows });
      } catch (_) {
        this.setData({ historyList: [] });
      } finally {
        this.setData({ historyLoading: false });
      }
    },

    async onPickHistory(e: WechatMiniprogram.BaseEvent) {
      const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
      if (!id) return;
      try {
        await chatStore.loadHistory(id);
        this.setData({ historyVisible: false, expanded: true, resumeCard: null });
        this.scrollToBottom();
      } catch (_) {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    onNewFromHistory() {
      chatStore.reset();
      this.setData({ historyVisible: false, expanded: false, resumeCard: null });
    },

    // ====== 上次会话恢复 ======
    async checkResumable() {
      try {
        const res = await aiApi.listSessions(undefined, 1);
        const last = res.sessions?.[0];
        if (!last) return;
        const ts = last.updated_at ? new Date(last.updated_at).getTime() : 0;
        // 仅 24h 内的会话才提示
        if (ts && Date.now() - ts < 24 * 3600 * 1000) {
          this.setData({
            resumeCard: {
              id: String(last.id),
              title: last.title || sceneLabel(last.scene) || '上次对话',
              timeLabel: formatTime(last.updated_at),
            },
          });
        }
      } catch (_) {
        // ignore
      }
    },

    async onResumeLast() {
      const card = this.data.resumeCard;
      if (!card) return;
      try {
        await chatStore.loadHistory(card.id);
        this.setData({ resumeCard: null, expanded: true });
        this.scrollToBottom();
      } catch (_) {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    onDismissResume() {
      this.setData({ resumeCard: null });
    },

    onInputChange(e: WechatMiniprogram.Input) {
      this.setData({ text: e.detail.value });
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
          this.setData({ visible: false });
          break;
        case 'voice':
          this.startVoice();
          break;
      }
    },
    onSuggestionTap(e: WechatMiniprogram.BaseEvent) {
      const text = (e.currentTarget as unknown as { dataset: { text: string } }).dataset.text;
      if (text) {
        this.setData({ text });
        this.sendText(text);
      }
    },
    onToggleReasoning() {
      chatStore.toggleReasoning();
    },
    onToggleWebSearch() {
      chatStore.toggleWebSearch();
    },
    onToggleImageRecipe() {
      chatStore.toggleImageRecipe();
    },
    onMicTap() {
      this.startVoice();
    },
    onAbort() {
      chatStore.abort();
    },
    onRecipeCardTap(e: WechatMiniprogram.BaseEvent) {
      const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
      if (id) {
        this.setData({ visible: false });
        emit(EVENTS.TAB_BAR_SHOW);
        forceTabBar(false);
        wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
      }
    },
    scrollToBottom() {
      setTimeout(() => {
        const last = chatStore.messages[chatStore.messages.length - 1];
        if (last) this.setData({ scrollToView: `m-${last.client_id}` });
      }, 80);
    },
    async startVoice() {
      const rm = wx.getRecorderManager();
      try {
        await new Promise<void>((resolve) => {
          rm.onStart(() => resolve());
          rm.onError(() => resolve());
          rm.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' });
        });
        this.setData({ recording: true });
        wx.showToast({ title: '正在录音…松手发送', icon: 'none' });
        setTimeout(() => this.stopVoice(rm), 3000);
      } catch (e) {
        this.setData({ recording: false });
      }
    },
    async stopVoice(rm: WechatMiniprogram.RecorderManager) {
      const stopRes = await new Promise<{ tempFilePath?: string } | null>((resolve) => {
        rm.onStop((res: unknown) => resolve(res as { tempFilePath?: string }));
        rm.onError(() => resolve(null));
        rm.stop();
      });
      this.setData({ recording: false });
      const path = stopRes?.tempFilePath;
      if (!path) return;
      try {
        const info = await new Promise<{ size: number }>((resolve) => {
          (wx as unknown as { getFileInfo: Function }).getFileInfo({ filePath: path, success: (r: { size: number }) => resolve({ size: r.size }), fail: () => resolve({ size: 0 }) });
        });
        const asset = await uploadFile({
          tempFilePath: path,
          mediaKind: 'audio',
          contentType: 'audio/mpeg',
          sizeBytes: info.size,
        });
        const tr = await voiceApi.transcribe(String(asset.id));
        const text = (tr.text || '').trim();
        if (text) {
          this.setData({ text });
          this.sendText(text);
        }
      } catch (e) {
        wx.showToast({ title: '语音识别失败', icon: 'none' });
      }
    },
    async ensureSession() {
      if (chatStore.session) return;
      const scene = this.data.scene || 'chat';
      const recipeIdNum = this.data.recipeId ? Number(this.data.recipeId) : undefined;
      const reply = await aiApi.createSession({
        scene,
        title: this.data.context || 'AI 厨艺助理',
        recipe_id: recipeIdNum,
      });
      chatStore.setSession(reply.session);
    },
    async sendText(text: string) {
      const t = (text || this.data.text).trim();
      if (!t) {
        wx.showToast({ title: '请输入内容', icon: 'none' });
        return;
      }
      if (this.data.sending) return;
      this.setData({ sending: true, text: '' });
      try {
        await this.ensureSession();
        chatStore.send(t, {
          scene: this.data.scene || undefined,
          recipe_id: this.data.recipeId ? Number(this.data.recipeId) : undefined,
          quote_context: this.data.quoteContext || undefined,
        });
        // 发送后自动展开到全屏，方便看流式输出
        this.setData({ expanded: true });
        this.scrollToBottom();
      } catch (e) {
        wx.showToast({ title: '发送失败', icon: 'none' });
      } finally {
        this.setData({ sending: false });
      }
    },
    onSendTap() {
      this.sendText(this.data.text);
    },
  },
});
