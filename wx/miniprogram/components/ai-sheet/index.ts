// AI 助理抽屉（馋猫浮球点击后弹出）
// 阶段 0：仅做骨架与占位交互；阶段 6 接入 chatStore + SSE 流式
// 使用方式：在每个 Tab 页面（home/recipes-list/plan/me）的 wxml 引入 <ai-sheet />，组件自动监听 EVENTS.AI_OPEN
import { on, EVENTS } from '../../utils/eventbus';

interface QuickQuestion {
  id: string;
  icon: string;
  text: string;
}

Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
  },
  properties: {
    // 当前页面上下文（如菜谱标题、步骤），用于在抽屉头部展示
    context: { type: String, value: '' },
  },
  data: {
    visible: false,
    fullscreen: false,
    text: '',
    quickQuestions: [
      { id: 'recipe', icon: '📖', text: '菜谱推荐' },
      { id: 'qa', icon: '❓', text: '问答解答' },
      { id: 'snap', icon: '📷', text: '识别食材' },
      { id: 'voice', icon: '🎤', text: '语音问答' },
    ] as QuickQuestion[],
    reasoningEnabled: false,
    webSearchEnabled: false,
  },
  lifetimes: {
    attached() {
      // 监听 AI_OPEN 事件，使用 wx 元数据保存解绑函数（避免类型 strict 不允许 method 属性）
      const unbind = on(EVENTS.AI_OPEN, () => {
        this.setData({ visible: true });
      });
      // 用 wx data 不可变区，存到 this 上的私有字段
      (this as unknown as { __unbind: () => void }).__unbind = unbind;
    },
    detached() {
      (this as unknown as { __unbind?: () => void }).__unbind?.();
    },
  },
  methods: {
    onClose() {
      this.setData({ visible: false, fullscreen: false });
    },
    onToggleFullscreen() {
      this.setData({ fullscreen: !this.data.fullscreen });
    },
    onMaskTap() {
      this.onClose();
    },
    onSheetTap() {
      // wxml 上已用 catchtap 阻止冒泡，这里无需操作
    },
    onInputChange(e: WechatMiniprogram.Input) {
      this.setData({ text: e.detail.value });
    },
    onQuickTap(e: WechatMiniprogram.BaseEvent) {
      const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
      // 阶段 6：根据 id 触发不同的初始 prompt 或动作
      console.log('[ai-sheet] quick', id);
    },
    onSendTap() {
      const text = this.data.text.trim();
      if (!text) {
        wx.showToast({ title: '请输入内容', icon: 'none' });
        return;
      }
      // 阶段 6：调用 chatStore.send(text)
      console.log('[ai-sheet] send', text);
      this.setData({ text: '' });
    },
    onToggleReasoning() {
      this.setData({ reasoningEnabled: !this.data.reasoningEnabled });
    },
    onToggleWebSearch() {
      this.setData({ webSearchEnabled: !this.data.webSearchEnabled });
    },
  },
});
