// UI 全局状态 store（V10/V11）
// 用途：
//   - 托管自定义 tab-bar 的 tabSelected 索引（V10）
//   - 托管 ai-fab 浮球拖拽位置（V11，跨页面保持位置）
// 配合 custom-tab-bar 的 attached 自动推断当前 route，做到「公共组件，零页面侵入」
import { observable, action } from 'mobx-miniprogram';

export const uiStore = observable({
  // === V10: tab ===
  // 当前激活的 tab 索引（0=首页 / 1=菜谱 / 2=计划 / 3=我的）
  tabSelected: 0,

  setTabSelected: action(function (this: { tabSelected: number }, index: number) {
    if (this.tabSelected !== index) this.tabSelected = index;
  }),

  // === V11: ai-fab 浮球位置 ===
  // 用户未拖拽过时 fabPositioned=false，浮球用 CSS 默认位置（右下角）
  // 拖拽吸附后 fabPositioned=true，浮球用 inline left/top 定位，跨页面保持
  fabX: 0,
  fabY: 0,
  fabPositioned: false,

  setFabPos: action(function (this: { fabX: number; fabY: number; fabPositioned: boolean }, x: number, y: number) {
    this.fabX = x;
    this.fabY = y;
    this.fabPositioned = true;
  }),
});
