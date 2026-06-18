// 协议同意勾选组件（受控）：
//   <agreement-consent checked="{{agreed}}" bindchange="onAgreeChange" />
// 勾选状态由父页面持有；本组件只负责展示与触发 change 事件、打开文档链接。
import { openLegalDoc, type LegalDocKey } from '../../utils/legal';

Component({
  options: { addGlobalClass: true },
  properties: {
    checked: { type: Boolean, value: false },
  },
  methods: {
    // 切换勾选：向父页面抛出新状态（受控模式，本组件不自持状态）
    onToggle() {
      this.triggerEvent('change', { checked: !this.data.checked });
    },
    // 打开对应法律文档（不改变勾选状态）
    onOpen(e: WechatMiniprogram.BaseEvent) {
      const key = (e.currentTarget as unknown as { dataset: { key: LegalDocKey } }).dataset.key;
      openLegalDoc(key);
    },
  },
});
