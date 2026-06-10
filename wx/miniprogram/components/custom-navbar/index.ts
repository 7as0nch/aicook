// 统一自定义导航栏：自动计算 statusBarHeight + 胶囊高度
// 用法：
//   <custom-navbar title="标题">
//     <view slot="right">...</view>  <!-- 可选 -->
//   </custom-navbar>
// 或自定义中间区：
//   <custom-navbar showBack="{{true}}">
//     <view slot="title">...</view>
//     <view slot="right">...</view>
//   </custom-navbar>

Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    bg: { type: String, value: '#FFFFFF' },           // 背景色
    color: { type: String, value: '#1F1B16' },        // 文字色
    border: { type: Boolean, value: true },            // 是否显示底部分隔线
    fixed: { type: Boolean, value: false },            // 是否 fixed 定位
  },
  data: {
    statusBarHeight: 44,
    navBarHeight: 88,
    totalHeight: 132,
  },
  lifetimes: {
    attached() {
      try {
        const sys = (wx as unknown as { getWindowInfo?: () => { statusBarHeight?: number } })
          .getWindowInfo?.() || wx.getSystemInfoSync();
        const statusBarHeight = sys.statusBarHeight || 44;
        // 优先用胶囊算 navbar 高度（更准确）
        let navBarHeight = 88;
        try {
          const menu = wx.getMenuButtonBoundingClientRect?.();
          if (menu && menu.height) {
            navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
          }
        } catch (_) { /* 胶囊 API 不可用时用默认高度 */ }
        const totalHeight = statusBarHeight + navBarHeight;
        this.setData({ statusBarHeight, navBarHeight, totalHeight });
      } catch (_) { /* 系统信息获取失败时用 data 默认值 */ }
    },
  },
  methods: {
    onBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({ url: '/pages/home/index/index' });
      }
    },
    // 暴露给父页面，用于占位（fixed 定位时）
    getTotalHeight() {
      return this.data.totalHeight;
    },
  },
});
