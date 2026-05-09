// 自定义 tabBar：4 个常规 Tab + 中间凸起摄像头浮按（拍照识别入口）
// 中间浮按不是真正的 Tab，点击 navigateTo 到拍照识别页 pages/recipes/snap
// 注：AI 助理是另一个全局浮球（ai-fab），右下角独立显示，与 tabBar 解耦
interface TabItem {
  pagePath: string;
  text: string;
  iconSrc: string;          // 图标资源路径；为空时用 fallback emoji
  iconFallback: string;     // emoji 兜底
}

Component({
  data: {
    selected: 0,
    color: '#999999',
    selectedColor: '#FF6B1A',
    list: [
      { pagePath: '/pages/home/index/index', text: '首页', iconSrc: '', iconFallback: '🏠' },
      { pagePath: '/pages/recipes/list/index', text: '菜谱', iconSrc: '', iconFallback: '📖' },
      { pagePath: '/pages/plan/index/index', text: '计划', iconSrc: '', iconFallback: '🗓️' },
      { pagePath: '/pages/me/index/index', text: '我的', iconSrc: '', iconFallback: '👤' },
    ] as TabItem[],
  },
  methods: {
    switchTab(e: WechatMiniprogram.BaseEvent) {
      const data = (e.currentTarget as unknown as { dataset: { path: string; index: string } }).dataset;
      const url = data.path;
      const index = Number(data.index);
      wx.switchTab({ url });
      this.setData({ selected: index });
    },
    onCameraTap() {
      // 中间浮按：跳转拍照识别页（设计稿 02 拍照识别）
      wx.navigateTo({ url: '/pages/recipes/snap/index' });
    },
  },
});
