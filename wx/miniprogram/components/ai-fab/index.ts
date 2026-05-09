// AI 助理浮球（馋猫 IP 形象）
// 用途：每个页面右下角全局浮球，点击 emit AI_OPEN 触发 ai-sheet 抽屉显示
// 使用：<ai-fab />（所有 Tab 页 + 菜谱详情 + 做菜中页面引入）
import { emit, EVENTS } from '../../utils/eventbus';

Component({
  properties: {
    // icon 插槽：传入图片路径覆盖默认馋猫；为空时显示 emoji 占位
    iconSrc: { type: String, value: '' },
    // 偏移：底部留出 tabBar 高度（默认 200rpx 适配 tabBar；做菜中等无 tabBar 页可设 60rpx）
    bottom: { type: String, value: '200rpx' },
  },
  methods: {
    onTap() {
      emit(EVENTS.AI_OPEN);
    },
  },
});
