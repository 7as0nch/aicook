// 「正在做的菜」全局浮球 + 抽屉。
// 用途：有进行中的烹饪会话时出现浮球（默认右侧，可拖拽、吸附左右边缘、位置持久化）；
//      点开抽屉列出在做的菜，点行进入步骤页继续，左滑露出「删除」结束该会话。
// 使用：<cooking-fab />（与 <ai-fab /> 一样按页引入；空态自动隐藏）
import { cookingStore } from '../../store/cooking.store';
import { stableMediaURL } from '../../utils/media-cache';
import { hasToken } from '../../utils/auth-guard';

type CookingVM = {
  key: string;
  recipe_id: string;
  title: string;
  cover: string;
  stepLabel: string;
};

// —— 行内左滑删除参数（rpx）——
const DELETE_W_RPX = 140; // 删除按钮宽度 = 划开距离
const OPEN_THRESHOLD_RPX = 70; // 滑过此距离吸附为「划开」
const TAP_MOVE_RPX = 16; // 位移小于此值视为点击

// —— 浮球拖拽参数（px）——
const FAB_SIZE_PX = 54; // 108rpx 对应 px（按 750 设计宽换算的近似边长）
const DRAG_THRESHOLD_PX = 6; // 超过此位移才算拖拽（区分 tap）
const EDGE_MARGIN_PX = 8; // 吸附后离边缘间距
const TOP_BLOCK_PX = 100; // 顶部避让
const BOTTOM_BLOCK_PX = 120; // 底部避让（tabBar）
const POS_KEY = 'COOKING_FAB_POS'; // 拖拽后的位置持久化（跨页/重启保持）

type Swipe = { key: string; startX: number; base: number; rpxPerPx: number; moved: number };
type Drag = {
  startX: number;
  startY: number;
  startTs: number;
  fabStartX: number;
  fabStartY: number;
  screenW: number;
  screenH: number;
};

Component({
  properties: {
    // 浮球离底部默认距离（rpx 字符串）；默认靠右、且高于 AI 浮球避免重叠
    bottom: { type: String, value: '330rpx' },
  },
  data: {
    items: [] as CookingVM[],
    drawerOpen: false,
    // 行内左滑态
    openKey: '',
    dragKey: '',
    dragX: 0,
    // 浮球拖拽态
    fabX: 0,
    fabY: 0,
    fabPositioned: false,
    fabDragging: false,
  },
  lifetimes: {
    attached() {
      // 恢复上次拖拽位置
      try {
        const saved = wx.getStorageSync(POS_KEY);
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
          this.setData({ fabX: saved.x, fabY: saved.y, fabPositioned: true });
        }
      } catch {
        // 读取失败则用默认右下位置
      }
    },
  },
  pageLifetimes: {
    show() {
      void this.loadItems();
    },
  },
  methods: {
    async loadItems() {
      if (!hasToken()) {
        this.setData({ items: [] });
        return;
      }
      try {
        await cookingStore.loadActive();
        const list = Object.values(cookingStore.activeMap || {});
        list.sort((a, b) => (Number(b.updated_at_ms) || 0) - (Number(a.updated_at_ms) || 0));
        const items: CookingVM[] = list.map((it) => ({
          key: String(it.recipe_id),
          recipe_id: String(it.recipe_id),
          title: it.title || '未命名菜谱',
          cover: stableMediaURL(it.cover_image_url || ''),
          stepLabel: it.total_steps ? `第 ${(it.step_index || 0) + 1}/${it.total_steps} 步` : '进行中',
        }));
        const patch: Record<string, unknown> = { items, openKey: '', dragKey: '', dragX: 0 };
        if (!items.length) patch.drawerOpen = false;
        this.setData(patch);
      } catch {
        this.setData({ items: [] });
      }
    },

    // ===== 浮球拖拽（仿 ai-fab：超阈值才拖，松手吸附左右边缘并持久化）=====
    onFabTouchStart(e: WechatMiniprogram.TouchEvent) {
      const t = e.touches[0];
      const sys = wx.getSystemInfoSync();
      const self = this as unknown as { _drag?: Drag };
      let fabStartX: number;
      let fabStartY: number;
      if (this.data.fabPositioned) {
        fabStartX = this.data.fabX;
        fabStartY = this.data.fabY;
      } else {
        const rpxPerPx = sys.windowWidth / 750;
        fabStartX = sys.windowWidth - FAB_SIZE_PX - 16; // 默认 right:32rpx ≈ 16px
        const bottomRpx = parseFloat(String(this.properties.bottom || '330rpx').replace('rpx', '')) || 330;
        fabStartY = sys.windowHeight - FAB_SIZE_PX - bottomRpx * rpxPerPx;
      }
      self._drag = {
        startX: t.clientX,
        startY: t.clientY,
        startTs: Date.now(),
        fabStartX,
        fabStartY,
        screenW: sys.windowWidth,
        screenH: sys.windowHeight,
      };
    },

    onFabTouchMove(e: WechatMiniprogram.TouchEvent) {
      const d = (this as unknown as { _drag?: Drag })._drag;
      if (!d) return;
      const t = e.touches[0];
      const dx = t.clientX - d.startX;
      const dy = t.clientY - d.startY;
      if (!this.data.fabDragging && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      let newX = d.fabStartX + dx;
      let newY = d.fabStartY + dy;
      newX = Math.max(EDGE_MARGIN_PX, Math.min(d.screenW - FAB_SIZE_PX - EDGE_MARGIN_PX, newX));
      newY = Math.max(TOP_BLOCK_PX, Math.min(d.screenH - FAB_SIZE_PX - BOTTOM_BLOCK_PX, newY));
      this.setData({ fabX: newX, fabY: newY, fabPositioned: true, fabDragging: true });
    },

    onFabTouchEnd(e: WechatMiniprogram.TouchEvent) {
      const self = this as unknown as { _drag?: Drag };
      const d = self._drag;
      self._drag = undefined;
      if (!d) return;
      const t = e.changedTouches[0];
      const moved = Math.abs(t.clientX - d.startX) + Math.abs(t.clientY - d.startY);
      const dt = Date.now() - d.startTs;
      // tap：位移小 + 时长短 → 打开抽屉
      if (moved < DRAG_THRESHOLD_PX && dt < 400) {
        this.setData({ fabDragging: false });
        this.onFabTap();
        return;
      }
      // 拖拽结束：吸附到最近的左/右边缘并持久化
      const snapLeft = this.data.fabX + FAB_SIZE_PX / 2 < d.screenW / 2;
      const targetX = snapLeft ? EDGE_MARGIN_PX : d.screenW - FAB_SIZE_PX - EDGE_MARGIN_PX;
      this.setData({ fabX: targetX, fabDragging: false, fabPositioned: true });
      try {
        wx.setStorageSync(POS_KEY, { x: targetX, y: this.data.fabY });
      } catch {
        // 持久化失败不影响本次使用
      }
    },

    onFabTap() {
      this.setData({ drawerOpen: true, openKey: '' });
    },

    // 抽屉打开时挂在 mask/sheet 上的空 touchmove 处理：靠 catch 拦截冒泡锁住背后页面
    noop() {},

    onCloseDrawer() {
      this.setData({ drawerOpen: false, openKey: '', dragKey: '', dragX: 0 });
    },

    // ===== 行内左滑删除 =====
    onRowTouchStart(e: WechatMiniprogram.TouchEvent) {
      const key = (e.currentTarget as unknown as { dataset: { key: string } }).dataset.key;
      const sys = wx.getSystemInfoSync();
      (this as unknown as { _sw?: Swipe })._sw = {
        key,
        startX: e.touches[0].clientX,
        base: this.data.openKey === key ? -DELETE_W_RPX : 0,
        rpxPerPx: 750 / sys.windowWidth,
        moved: 0,
      };
    },

    onRowTouchMove(e: WechatMiniprogram.TouchEvent) {
      const sw = (this as unknown as { _sw?: Swipe })._sw;
      if (!sw) return;
      const dxPx = e.touches[0].clientX - sw.startX;
      sw.moved = Math.max(sw.moved, Math.abs(dxPx));
      let x = sw.base + dxPx * sw.rpxPerPx;
      if (x > 0) x = 0;
      if (x < -DELETE_W_RPX) x = -DELETE_W_RPX;
      this.setData({ dragKey: sw.key, dragX: x });
    },

    onRowTouchEnd() {
      const self = this as unknown as { _sw?: Swipe };
      const sw = self._sw;
      self._sw = undefined;
      if (!sw) return;
      const movedRpx = sw.moved * sw.rpxPerPx;
      if (movedRpx < TAP_MOVE_RPX) {
        if (this.data.openKey === sw.key) {
          this.setData({ openKey: '', dragKey: '', dragX: 0 }); // 已划开 → 收回
        } else {
          this.gotoCooking(sw.key);
        }
        return;
      }
      const open = this.data.dragX < -OPEN_THRESHOLD_RPX;
      this.setData({ openKey: open ? sw.key : '', dragKey: '', dragX: 0 });
    },

    gotoCooking(recipeId: string) {
      this.setData({ drawerOpen: false, openKey: '', dragKey: '', dragX: 0 });
      wx.navigateTo({ url: `/pages/recipes/cooking/index?id=${recipeId}` });
    },

    async onDelete(e: WechatMiniprogram.BaseEvent) {
      const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
      if (!id) return;
      try {
        await cookingStore.finish(id);
      } catch {
        // 删除失败不致命，下面统一重载会还原真实状态
      }
      await this.loadItems();
    },
  },
});
