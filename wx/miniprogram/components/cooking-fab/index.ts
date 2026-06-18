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

// —— 「快结束」提醒 ——
const WARN_SECONDS = 60; // 当前步骤剩余 ≤ 此值弹「快好了」
const TICK_MS = 1000;
const REPOLL_MS = 30000; // 每 ~30s 重拉一次重置快照（容错暂停/延长/步骤变更）

// 已提醒去重：模块级 Set，跨组件实例（翻页换页）共享，避免同一菜同一步骤重复弹
const alertedKeys = new Set<string>();

type Snap = {
  recipeId: string;
  title: string;
  stepIndex: number;
  stepLabel: string;
  remaining: number; // poll 时的剩余秒数（服务端已算好）
  running: boolean;
  pollAt: number; // poll 的本地时间戳，用于本地递减
};
type AlertVM = { key: string; recipeId: string; title: string; stepLabel: string; text: string; kind: 'warn' | 'done' };

function fmtMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 清掉已不在做的菜的提醒 key，避免 Set 无限增长
function pruneAlerted(activeIds: Set<string>) {
  for (const k of Array.from(alertedKeys)) {
    if (!activeIds.has(k.split(':')[0])) alertedKeys.delete(k);
  }
}

Component({
  properties: {
    // 浮球离底部默认距离（rpx 字符串）；默认靠右、且高于 AI 浮球避免重叠
    bottom: { type: String, value: '330rpx' },
    // 在烹饪页传入当前菜 id：该菜的到点提醒由烹饪页自己负责，这里排除避免重复
    excludeRecipeId: { type: String, value: '' },
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
    // 「快结束」提醒横幅：多道菜各一条，顶部堆叠展示，分别可忽略/点进去
    alerts: [] as AlertVM[],
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
    detached() {
      this.stopTicker();
    },
  },
  pageLifetimes: {
    show() {
      void this.loadItems();
      this.startTicker();
    },
    hide() {
      this.stopTicker();
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
        // 倒计时快照：记录每道菜 poll 时的剩余秒数 + 计时状态，供本地 tick 递减侦测「快结束」
        const now = Date.now();
        const snap: Snap[] = list.map((it) => ({
          recipeId: String(it.recipe_id),
          title: it.title || '未命名菜谱',
          stepIndex: it.step_index || 0,
          stepLabel: it.total_steps ? `第 ${(it.step_index || 0) + 1}/${it.total_steps} 步` : '当前步骤',
          remaining: Number(it.remaining_seconds) || 0,
          running: !!it.timer_running,
          pollAt: now,
        }));
        const self = this as unknown as { _snap?: Snap[]; _lastPoll?: number };
        self._snap = snap;
        self._lastPoll = now;
        const activeIds = new Set(snap.map((s) => s.recipeId));
        pruneAlerted(activeIds);
        const patch: Record<string, unknown> = {
          items,
          openKey: '',
          dragKey: '',
          dragX: 0,
          // 已不在做的菜，其残留横幅一并清掉
          alerts: this.data.alerts.filter((a) => activeIds.has(a.recipeId)),
        };
        if (!items.length) patch.drawerOpen = false;
        this.setData(patch);
      } catch {
        this.setData({ items: [] });
      }
    },

    // ===== 「快结束」全局提醒 =====
    startTicker() {
      const self = this as unknown as { _tick?: number };
      if (self._tick) return;
      self._tick = setInterval(() => this.tick(), TICK_MS) as unknown as number;
    },

    stopTicker() {
      const self = this as unknown as { _tick?: number };
      if (self._tick) {
        clearInterval(self._tick);
        self._tick = undefined;
      }
    },

    tick() {
      const self = this as unknown as { _snap?: Snap[]; _lastPoll?: number };
      const snap = self._snap || [];
      // 周期性重拉，重置快照（容错 cooking 页改过的暂停/延长/步骤）
      if (Date.now() - (self._lastPoll || 0) > REPOLL_MS) {
        void this.loadItems();
      }
      // 多道菜：每道快结束的各弹一条，堆叠展示（不再「只显 1 条、其余排队」）。
      const exclude = String(this.properties.excludeRecipeId || '');
      const now = Date.now();
      let alerts = this.data.alerts.slice();
      let added = false;
      let addedDone = false;
      for (const s of snap) {
        if (!s.running) continue;
        if (exclude && s.recipeId === exclude) continue;
        const live = s.remaining - (now - s.pollAt) / 1000;
        const warnKey = `${s.recipeId}:${s.stepIndex}:warn`;
        const doneKey = `${s.recipeId}:${s.stepIndex}:done`;
        if (live <= 0) {
          if (!alertedKeys.has(doneKey)) {
            alertedKeys.add(doneKey);
            alertedKeys.add(warnKey); // 已到点，warn 不必再补弹
            // 升级：把该菜还在显示的「快好了」换成「时间到」
            alerts = alerts.filter((a) => !(a.recipeId === s.recipeId && a.kind === 'warn'));
            alerts.push({ key: doneKey, recipeId: s.recipeId, title: s.title, stepLabel: s.stepLabel, text: '时间到啦', kind: 'done' });
            added = true;
            addedDone = true;
          }
        } else if (live <= WARN_SECONDS) {
          if (!alertedKeys.has(warnKey)) {
            alertedKeys.add(warnKey);
            alerts.push({ key: warnKey, recipeId: s.recipeId, title: s.title, stepLabel: s.stepLabel, text: `还有 ${fmtMMSS(live)}，快好了`, kind: 'warn' });
            added = true;
          }
        }
      }
      if (added) {
        // 本 tick 有新提醒才震一次（到点用长震，仅快好了用短震），避免多条各震一遍
        if (addedDone) {
          wx.vibrateLong();
        } else {
          wx.vibrateShort({ type: 'medium' });
        }
        this.setData({ alerts });
      }
    },

    onAlertDismiss(e: WechatMiniprogram.BaseEvent) {
      const key = (e.currentTarget as unknown as { dataset: { key: string } }).dataset.key;
      this.setData({ alerts: this.data.alerts.filter((a) => a.key !== key) });
    },

    onAlertGo(e: WechatMiniprogram.BaseEvent) {
      const key = (e.currentTarget as unknown as { dataset: { key: string } }).dataset.key;
      const a = this.data.alerts.find((x) => x.key === key);
      this.setData({ alerts: this.data.alerts.filter((x) => x.key !== key) });
      if (a && a.recipeId) {
        wx.navigateTo({ url: `/pages/recipes/cooking/index?id=${a.recipeId}` });
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
