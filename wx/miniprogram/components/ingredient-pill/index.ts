// 食材标签 pill: emoji + 名称 + 可选关闭 ×
Component({
  properties: {
    emoji: { type: String, value: '' },
    name: { type: String, value: '' },
    closable: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
    // 特殊变体："+ 添加" 占位
    addVariant: { type: Boolean, value: false },
    size: { type: String, value: 'md' }, // 'sm' | 'md'
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { name: this.data.name });
    },
    onCloseTap() {
      this.triggerEvent('close', { name: this.data.name });
    },
  },
});
