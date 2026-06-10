// AI 助理浮球（馋猫 IP 形象）
// 用途：每个页面右下角全局浮球，点击通过 chatStore.openSheet() 唤起 ai-sheet 抽屉
// 使用：<ai-fab />（所有 Tab 页 + 菜谱详情 + 做菜中页面引入）
//
// V11 新增：
//   1) 拖拽：长按浮球可拖动，松手吸附到左/右边缘，位置全局保存（跨页面保持）
//   2) 招呼气泡：每次页面 show 时随机一句招呼语，3.5 秒后自动消失
import { chatStore } from '../../store/chat.store';
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { uiStore } from '../../store/ui.store';

const GREETINGS = [
  '哈喽～来问问我做什么吃',
  '不知道吃啥？问我呀～',
  '想做点新菜？我帮你出主意',
  '今天来点什么口味呢？',
  '冰箱里有啥？我帮你配菜～',
  '想吃啥说一声，我有点子！',
];

const GREETING_MS = 3500;       // 招呼气泡显示时长
const DRAG_THRESHOLD_PX = 6;    // 移动超过此距离视为拖拽（区分 tap）
const FAB_SIZE_PX = 54;         // 浮球边长（108rpx，按 750rpx 设计宽度对应 px）
const EDGE_MARGIN_PX = 8;       // 吸附后离屏幕边缘的间距
const TOP_BLOCK_PX = 100;       // 顶部避让（navbar）
const BOTTOM_BLOCK_PX = 120;    // 底部避让（tab-bar）

Component({
  properties: {
    iconSrc: { type: String, value: '' },
    // 浮球离底部的默认距离（rpx 字符串）；未拖拽过时生效
    bottom: { type: String, value: '200rpx' },
  },
  data: {
    // 以下 3 个字段由 storeBinding 自动注入（来自 uiStore）
    fabX: 0,
    fabY: 0,
    fabPositioned: false,
    // 本地状态
    dragging: false,
    greetingVisible: false,
    greetingText: '',
    // 招呼气泡相对浮球的展开方向：'right' = 气泡贴浮球右边向左展开（浮球在右半屏时）
    //                            'left'  = 气泡贴浮球左边向右展开（浮球在左半屏时）
    bubbleSide: 'right' as 'left' | 'right',
  },
  observers: {
    // 浮球位置变化时自动重算气泡方向，确保气泡始终向屏幕中间展开，不超出屏幕
    'fabX, fabPositioned': function (fabX: number, fabPositioned: boolean) {
      let side: 'left' | 'right' = 'right';
      if (fabPositioned) {
        const sys = wx.getSystemInfoSync();
        // 浮球中心点过屏幕中线 → 气泡用 left:0（向右展开）；否则用 right:0（向左展开）
        side = (fabX + FAB_SIZE_PX / 2 < sys.windowWidth / 2) ? 'left' : 'right';
      }
      if (side !== this.data.bubbleSide) {
        this.setData({ bubbleSide: side });
      }
    },
  },
  lifetimes: {
    attached() {
      const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
      self.storeBindings = createStoreBindings(this, {
        store: uiStore,
        fields: ['fabX', 'fabY', 'fabPositioned'] as const,
        actions: [] as const,
      });
    },
    detached() {
      const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void }; _greetTimer?: number };
      if (self._greetTimer) {
        clearTimeout(self._greetTimer);
        self._greetTimer = undefined;
      }
      self.storeBindings?.destroyStoreBindings();
    },
  },
  pageLifetimes: {
    show() {
      // 每次切回页面 / 首次进入 → 触发招呼气泡
      this.showGreeting();
    },
    hide() {
      // 离开页面时清理招呼定时器
      const self = this as unknown as { _greetTimer?: number };
      if (self._greetTimer) {
        clearTimeout(self._greetTimer);
        self._greetTimer = undefined;
      }
      if (this.data.greetingVisible) {
        this.setData({ greetingVisible: false });
      }
    },
  },
  methods: {
    showGreeting() {
      // sheet 已打开时不重复招呼（用户已经在聊了）
      if (chatStore.sheetVisible) return;
      const self = this as unknown as { _greetTimer?: number };
      if (self._greetTimer) clearTimeout(self._greetTimer);
      const text = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      this.setData({ greetingText: text, greetingVisible: true });
      self._greetTimer = setTimeout(() => {
        this.setData({ greetingVisible: false });
        self._greetTimer = undefined;
      }, GREETING_MS) as unknown as number;
    },

    onTouchStart(e: WechatMiniprogram.TouchEvent) {
      const t = e.touches[0];
      const self = this as unknown as {
        _startX: number; _startY: number; _startTs: number;
        _fabStartX: number; _fabStartY: number;
        _screenW: number; _screenH: number;
      };
      self._startX = t.clientX;
      self._startY = t.clientY;
      self._startTs = Date.now();
      const sys = wx.getSystemInfoSync();
      self._screenW = sys.windowWidth;
      self._screenH = sys.windowHeight;
      // 记起始位置：拖过则用 store 里的坐标，否则按默认右下角换算
      if (this.data.fabPositioned) {
        self._fabStartX = this.data.fabX;
        self._fabStartY = this.data.fabY;
      } else {
        self._fabStartX = self._screenW - FAB_SIZE_PX - 16;
        const rpxPerPx = self._screenW / 750;
        const bottomRaw = (this.properties as { bottom?: string }).bottom || '200rpx';
        const bottomRpx = parseFloat(String(bottomRaw).replace('rpx', '')) || 200;
        const bottomPx = bottomRpx * rpxPerPx;
        self._fabStartY = self._screenH - FAB_SIZE_PX - bottomPx;
      }
    },

    onTouchMove(e: WechatMiniprogram.TouchEvent) {
      const t = e.touches[0];
      const self = this as unknown as {
        _startX: number; _startY: number;
        _fabStartX: number; _fabStartY: number;
        _screenW: number; _screenH: number;
      };
      const dx = t.clientX - self._startX;
      const dy = t.clientY - self._startY;
      // 未越过阈值不触发拖拽，保留 tap 可能性
      if (!this.data.dragging && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      let newX = self._fabStartX + dx;
      let newY = self._fabStartY + dy;
      // 边界限制
      newX = Math.max(EDGE_MARGIN_PX, Math.min(self._screenW - FAB_SIZE_PX - EDGE_MARGIN_PX, newX));
      newY = Math.max(TOP_BLOCK_PX, Math.min(self._screenH - FAB_SIZE_PX - BOTTOM_BLOCK_PX, newY));
      // 拖拽中即时隐藏招呼气泡
      const patch: Record<string, unknown> = { fabX: newX, fabY: newY, fabPositioned: true, dragging: true };
      if (this.data.greetingVisible) patch.greetingVisible = false;
      this.setData(patch);
    },

    onTouchEnd(e: WechatMiniprogram.TouchEvent) {
      const self = this as unknown as { _startX: number; _startY: number; _startTs: number; _screenW: number };
      const t = e.changedTouches[0];
      const dx = t.clientX - self._startX;
      const dy = t.clientY - self._startY;
      const dt = Date.now() - self._startTs;
      const moved = Math.abs(dx) + Math.abs(dy);

      // tap 判定：移动 < 阈值 + 时长 < 400ms
      if (moved < DRAG_THRESHOLD_PX && dt < 400) {
        this.setData({ dragging: false });
        this.onTap();
        return;
      }
      // 拖拽结束：吸附到左/右边缘
      const finalX = this.data.fabX;
      const snapLeft = finalX + FAB_SIZE_PX / 2 < self._screenW / 2;
      const targetX = snapLeft
        ? EDGE_MARGIN_PX
        : self._screenW - FAB_SIZE_PX - EDGE_MARGIN_PX;
      this.setData({ fabX: targetX, dragging: false, fabPositioned: true });
      uiStore.setFabPos(targetX, this.data.fabY);
    },

    onTap() {
      // 点击：隐藏招呼气泡 + 唤起 sheet
      const self = this as unknown as { _greetTimer?: number };
      if (self._greetTimer) {
        clearTimeout(self._greetTimer);
        self._greetTimer = undefined;
      }
      if (this.data.greetingVisible) this.setData({ greetingVisible: false });
      chatStore.openSheet({ scene: 'chat' });
    },
  },
});
