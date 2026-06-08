// 包包 Bao 形象 + 气泡问候
Component({
  properties: {
    // 'default' | 'smile' | 'wink' | 'thinking'
    state: { type: String, value: 'default' },
    text: { type: String, value: '' },
    size: { type: String, value: 'md' }, // 'sm' | 'md' | 'lg'
    // 横向气泡（默认）/ 竖直堆叠
    layout: { type: String, value: 'horizontal' },
  },
  data: {
    emojiMap: {
      default: '🥟',
      smile: '😊',
      wink: '😉',
      thinking: '🤔',
    } as Record<string, string>,
    srcMap: {
      default: '/assets/mascot/bao-default.png',
      smile: '/assets/mascot/bao-smile.png',
      wink: '/assets/mascot/bao-wink.png',
      thinking: '/assets/mascot/bao-thinking.png',
    } as Record<string, string>,
    imageLoaded: false,
  },
  lifetimes: {
    attached() {
      // 检测占位 1x1 PNG：通过加载后判断尺寸；最简方案直接尝试加载，失败则用 emoji
      this.setData({ imageLoaded: false });
    },
  },
  methods: {
    onImgError() {
      this.setData({ imageLoaded: false });
    },
    onImgLoad(e: WechatMiniprogram.CustomEvent<{ width: number; height: number }>) {
      // 1×1 占位 PNG 加载后 width=height=1，识别后退到 emoji
      const w = e.detail && e.detail.width ? e.detail.width : 0;
      if (w >= 16) this.setData({ imageLoaded: true });
    },
  },
});
