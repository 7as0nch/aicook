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
    // 叠加模式：透明浮在 hero/取景大图之上、不占文档流（无占位块），按钮带半透明圆底
    overlay: { type: Boolean, value: false },
  },
  data: {
    statusBarHeight: 44,
    navBarHeight: 88,
    totalHeight: 132,
    // 右侧需为微信胶囊让出的宽度（px）：导航内容（右插槽/标题）不得伸到胶囊下方
    capsuleInset: 96,
  },
  lifetimes: {
    attached() {
      try {
        const sys = (wx as unknown as { getWindowInfo?: () => { statusBarHeight?: number; windowWidth?: number; screenWidth?: number } })
          .getWindowInfo?.() || wx.getSystemInfoSync();
        const statusBarHeight = sys.statusBarHeight || 44;
        const windowWidth = sys.windowWidth || sys.screenWidth || 375;
        // 优先用胶囊算 navbar 高度（更准确）
        let navBarHeight = 88;
        let capsuleInset = 96;
        try {
          const menu = wx.getMenuButtonBoundingClientRect?.();
          if (menu && menu.height) {
            navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
            // 从胶囊左缘到屏幕右缘 + 8px 安全间距，作为导航右侧内边距
            capsuleInset = Math.max(0, windowWidth - menu.left + 8);
          }
        } catch (_) { /* 胶囊 API 不可用时用默认高度 */ }
        const totalHeight = statusBarHeight + navBarHeight;
        this.setData({ statusBarHeight, navBarHeight, totalHeight, capsuleInset });
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
