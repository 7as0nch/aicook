// 快捷入口：圆形彩色背景 + emoji/图标 + 文字
Component({
  properties: {
    icon: { type: String, value: '' },       // emoji 兜底
    iconSrc: { type: String, value: '' },     // 优先用图片
    label: { type: String, value: '' },
    // 主题：决定圆背景色
    theme: { type: String, value: 'orange' }, // 'orange' | 'green' | 'blue' | 'gray'
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
