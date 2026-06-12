// 通用单行输入弹层（替代已弃用的 wx.showModal({editable:true})）
// 用法：
//   <input-dialog visible="{{dlg.visible}}" title="加入厨房" placeholder="请输入分享码"
//     bind:confirm="onDlgConfirm" bind:close="onDlgClose" />
import { emit, EVENTS } from '../../utils/eventbus';

Component({
  options: { addGlobalClass: true },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    confirmText: { type: String, value: '确定' },
    maxlength: { type: Number, value: 50 },
  },
  data: {
    value: '',
  },
  observers: {
    // 每次打开清空上次输入；并隐藏自定义 tabBar——它在页面之外的独立层，
    // 页面内再高的 z-index 也盖不住，只能让它隐藏（与 ai-sheet 同一套机制）。
    visible(v: boolean) {
      if (v) {
        this.setData({ value: '' });
        emit(EVENTS.TAB_BAR_HIDE);
      } else {
        emit(EVENTS.TAB_BAR_SHOW);
      }
    },
  },
  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.setData({ value: e.detail.value });
    },
    onCancel() {
      this.triggerEvent('close');
    },
    onConfirm() {
      const value = this.data.value.trim();
      if (!value) {
        wx.showToast({ title: '请输入内容', icon: 'none' });
        return;
      }
      this.triggerEvent('confirm', { value });
    },
    // 阻止滚动穿透
    noop() {},
  },
});
