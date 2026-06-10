// 自定义 tabBar：4 个常规 Tab + 中间凸起摄像头浮按（拍照识别入口）
// 中间浮按不是真正的 Tab，点击 navigateTo 到拍照识别页 pages/recipes/snap
// 注：AI 助理是另一个全局浮球（ai-fab），右下角独立显示，与 tabBar 解耦
// V10 改造：tabSelected 托管到 uiStore，attached 时自动按 route 推断索引；
//   切 tab 时先改 store 再 wx.switchTab，消除"中间错位帧"闪烁。
//   4 个 tab 页页面文件不再需要任何 tab-bar 相关同步代码（公共组件零侵入）。
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { uiStore } from '../store/ui.store';
import { on, EVENTS } from '../utils/eventbus';

interface TabItem {
  pagePath: string;
  text: string;
  iconSrc: string;          // 普通态图标
  activeIconSrc: string;    // 激活态图标（橙色）
  iconFallback: string;     // emoji 兜底
}

const TAB_LIST: TabItem[] = [
  { pagePath: '/pages/home/index/index', text: '首页', iconSrc: '/assets/icons/home.png', activeIconSrc: '/assets/icons/home-active.svg', iconFallback: '🏠' },
  { pagePath: '/pages/recipes/list/index', text: '菜谱', iconSrc: '/assets/icons/recipe.png', activeIconSrc: '/assets/icons/recipe-active.svg', iconFallback: '📖' },
  { pagePath: '/pages/plan/index/index', text: '计划', iconSrc: '/assets/icons/plan.png', activeIconSrc: '/assets/icons/plan-active.svg', iconFallback: '🗓️' },
  { pagePath: '/pages/me/index/index', text: '我的', iconSrc: '/assets/icons/me.png', activeIconSrc: '/assets/icons/me-active.svg', iconFallback: '👤' },
];

Component({
  data: {
    color: '#A8A49C',
    selectedColor: '#FF7A00',
    hidden: false,
    list: TAB_LIST,
    // tabSelected 由 storeBindings 注入
  },
  lifetimes: {
    attached() {
      const self = this as unknown as { __unbindHide?: () => void; __unbindShow?: () => void; storeBindings?: { destroyStoreBindings: () => void } };
      this.setData({ hidden: false });

      // 1) 绑 store：tabSelected 从 uiStore 自动注入到 data
      self.storeBindings = createStoreBindings(this, {
        store: uiStore,
        fields: ['tabSelected'] as const,
        actions: [] as const,
      });

      // 2) 按当前页 route 推断 tab 索引（覆盖深链直开 + 重新 attached 两种入口）
      try {
        const pages = getCurrentPages();
        const route = pages[pages.length - 1]?.route || '';
        const idx = TAB_LIST.findIndex(t => t.pagePath.replace(/^\//, '') === route);
        if (idx >= 0) uiStore.setTabSelected(idx);
      } catch (_) {
        // 安全兜底
      }

      // 3) tab-bar 显隐事件总线
      self.__unbindHide = on(EVENTS.TAB_BAR_HIDE, () => this.setData({ hidden: true }));
      self.__unbindShow = on(EVENTS.TAB_BAR_SHOW, () => this.setData({ hidden: false }));
    },
    detached() {
      const self = this as unknown as { __unbindHide?: () => void; __unbindShow?: () => void; storeBindings?: { destroyStoreBindings: () => void } };
      self.__unbindHide?.();
      self.__unbindShow?.();
      self.storeBindings?.destroyStoreBindings();
    },
  },
  methods: {
    switchTab(e: WechatMiniprogram.BaseEvent) {
      const data = (e.currentTarget as unknown as { dataset: { path: string; index: string } }).dataset;
      const url = data.path;
      const index = Number(data.index);
      // 关键：先改 store 再切页 —— 新页面的 tab-bar attached 时直接读到正确 selected
      uiStore.setTabSelected(index);
      wx.switchTab({ url });
    },
    onCameraTap() {
      // 中间浮按：跳转拍照识别页（设计稿 02 拍照识别）
      wx.navigateTo({ url: '/pages/recipes/snap/index' });
    },
  },
});
