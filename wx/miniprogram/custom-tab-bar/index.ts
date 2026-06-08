// 自定义 tabBar：4 个常规 Tab + 中间凸起摄像头浮按（拍照识别入口）
// 中间浮按不是真正的 Tab，点击 navigateTo 到拍照识别页 pages/recipes/snap
// 注：AI 助理是另一个全局浮球（ai-fab），右下角独立显示，与 tabBar 解耦
import { on, EVENTS } from '../utils/eventbus';

interface TabItem {
  pagePath: string;
  text: string;
  iconSrc: string;          // 普通态图标
  activeIconSrc: string;    // 激活态图标（橙色）
  iconFallback: string;     // emoji 兜底
}

Component({
  data: {
    selected: 0,
    color: '#A8A49C',
    selectedColor: '#FF7A00',
    hidden: false,
    list: [
      { pagePath: '/pages/home/index/index', text: '首页', iconSrc: '/assets/icons/home.png', activeIconSrc: '/assets/icons/home-active.svg', iconFallback: '🏠' },
      { pagePath: '/pages/recipes/list/index', text: '菜谱', iconSrc: '/assets/icons/recipe.png', activeIconSrc: '/assets/icons/recipe-active.svg', iconFallback: '📖' },
      { pagePath: '/pages/plan/index/index', text: '计划', iconSrc: '/assets/icons/plan.png', activeIconSrc: '/assets/icons/plan-active.svg', iconFallback: '🗓️' },
      { pagePath: '/pages/me/index/index', text: '我的', iconSrc: '/assets/icons/me.png', activeIconSrc: '/assets/icons/me-active.svg', iconFallback: '👤' },
    ] as TabItem[],
  },
  lifetimes: {
    attached() {
      const self = this as unknown as { __unbindHide?: () => void; __unbindShow?: () => void };
      // 每次 tab 切换时，每个 page 的 custom-tab-bar 是独立实例，attached 时默认显示
      this.setData({ hidden: false });
      self.__unbindHide = on(EVENTS.TAB_BAR_HIDE, () => this.setData({ hidden: true }));
      self.__unbindShow = on(EVENTS.TAB_BAR_SHOW, () => this.setData({ hidden: false }));
    },
    detached() {
      const self = this as unknown as { __unbindHide?: () => void; __unbindShow?: () => void };
      self.__unbindHide?.();
      self.__unbindShow?.();
    },
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
