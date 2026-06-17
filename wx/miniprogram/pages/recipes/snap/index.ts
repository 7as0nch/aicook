// 拍照识别页（设计稿 02）
// 流程：相机取景器 → takePhoto → uploadFile → importApi.createImageRecipe →
//      poll getImportJob → 抽取食材 chips → "✨ 生成推荐菜谱" CTA 跳今日推荐页
import { importApi, isImportJobDone, isImportJobFailed } from '../../../services/import.api';
import { recipeApi } from '../../../services/recipe.api';
import { aiApi } from '../../../services/ai.api';
import { kitchenApi } from '../../../services/kitchen.api';
import { uploadFile } from '../../../services/upload';
import { chatStore } from '../../../store/chat.store';
import { inventoryStore } from '../../../store/inventory.store';
import { emojiFor } from '../../../utils/food-emoji';
import type { ImportJob } from '../../../types/api';

interface IngredChip {
  id: string;
  emoji: string;
  name: string;
  quantity: string;   // 数量（AI 识别给默认，可编辑；存冰箱/采购时带上）
}

// 推荐菜（来源 library=库内已有 / ai=即兴新菜）
interface DishRec {
  title: string;
  reason: string;
  source: string;
  recipe_id: string;
}

// 食材 emoji 映射统一在 utils/food-emoji.ts

Page({
  cameraCtx: null as ReturnType<typeof wx.createCameraContext> | null,
  pollTimer: null as ReturnType<typeof setTimeout> | null,

  data: {
    captured: false,
    recognizing: false,
    recognized: false,
    chips: [] as IngredChip[],
    devicePosition: 'back' as 'back' | 'front',
    capturedPath: '',
    error: '',
    cameraBroken: false,         // 相机初始化失败/被占用：显示相册降级入口
    sheetOpen: false,            // 抽屉是否展开：默认收起
    addChipVisible: false,       // 添加食材弹层（input-dialog）
    // 编辑数量弹层（input-dialog）
    qtyDialogVisible: false,
    editingQtyId: '',
    editingQtyValue: '',
    // 抽屉两阶段：chips=识别食材 / recos=推荐菜谱列表
    recoPhase: 'chips' as 'chips' | 'recos',
    recommendations: [] as DishRec[],
    recommending: false,
  },

  onReady() {
    this.cameraCtx = wx.createCameraContext();
  },

  onUnload() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  },

  onToggleSheet() {
    this.setData({ sheetOpen: !this.data.sheetOpen });
  },

  onOpenSheet() {
    this.setData({ sheetOpen: true });
  },

  onCloseSheet() {
    this.setData({ sheetOpen: false });
  },

  onShutterTap() {
    if (this.data.recognizing) return;
    if (!this.cameraCtx) {
      // 无相机时退到 chooseMedia 兜底
      this.pickFromAlbum();
      return;
    }
    this.cameraCtx.takePhoto({
      quality: 'high',
      success: (res) => this.processImage(res.tempImagePath),
      fail: (err) => {
        console.error('[snap] takePhoto fail', err);
        this.pickFromAlbum();
      },
    });
  },

  pickFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles?.[0];
        if (file?.tempFilePath) this.processImage(file.tempFilePath);
      },
    });
  },

  async processImage(tempPath: string) {
    this.setData({ captured: true, recognizing: true, recognized: false, capturedPath: tempPath, error: '' });
    try {
      // 1. 上传图片
      const info = await getFileInfo(tempPath);
      console.info('[snap] upload start, size =', info.size);
      const asset = await uploadFile({
        tempFilePath: tempPath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: info.size,
      });
      console.info('[snap] upload done, asset_id =', String(asset.id));
      // 2. 创建识别任务（后端同步执行，返回时 job 已是终态）
      const created = await importApi.createImageRecipe([String(asset.id)]);
      console.info('[snap] job created, id =', String(created.job.id), 'status =', created.job.status);
      // 3. 轮询兜底（正常情况下 create 返回即终态，最多再确认一轮）
      const final = await this.pollJob(created.job.id);
      // 4. 抽取食材 chip（带 AI 数量）
      const ings = extractIngredients(final);
      console.info('[snap] recognized ingredients:', ings);
      const chips: IngredChip[] = ings.map((ing, i) => ({
        id: `c${i}`,
        name: ing.name,
        quantity: ing.quantity,
        emoji: emojiFor(ing.name),
      }));
      // 识别完成自动展开抽屉
      this.setData({ recognizing: false, recognized: true, chips, sheetOpen: true });
      if (!chips.length) {
        wx.showToast({ title: '没有识别到食材，可手动添加', icon: 'none' });
      }
    } catch (err) {
      console.error('[snap] process image error', err);
      const msg = (err as { message?: string })?.message || '识别失败，请重试';
      this.setData({
        recognizing: false,
        recognized: false,
        error: msg,
      });
      wx.showToast({ title: msg, icon: 'none', duration: 3000 });
    }
  },

  pollJob(jobId: string | number): Promise<ImportJob> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const TIMEOUT = 60 * 1000; // 60s
      const tick = async () => {
        try {
          const res = await importApi.getImportJob(jobId);
          const job = res.job;
          // 注意：后端成功时状态是 review_required（草稿待确认），不是 success
          if (isImportJobDone(job.status)) {
            resolve(job);
            return;
          }
          if (isImportJobFailed(job.status)) {
            reject(new Error(job.error_message || '识别失败'));
            return;
          }
          if (Date.now() - start > TIMEOUT) {
            reject(new Error('识别超时，请重试'));
            return;
          }
          this.pollTimer = setTimeout(tick, 1500);
        } catch (e) {
          console.error('[snap] poll job error', e);
          reject(e);
        }
      };
      tick();
    });
  },

  // 点击 chip 上的 × 直接删除
  onChipDelete(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (!id) return;
    this.setData({ chips: this.data.chips.filter(c => c.id !== id) });
  },

  // 长按 chip 弹确认删除
  onChipLongpress(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    const target = this.data.chips.find(c => c.id === id);
    if (!target) return;
    wx.showModal({
      title: '删除食材',
      content: `确定移除「${target.name}」吗？`,
      confirmText: '删除',
      confirmColor: '#E5604A',
      success: (res) => {
        if (res.confirm) {
          this.setData({ chips: this.data.chips.filter(c => c.id !== id) });
        }
      },
    });
  },

  // 空函数：用于 catch 事件阻止冒泡（如数量徽的 longpress 不触发父级删除）
  noop() {},

  // 添加食材：自定义弹层（wx.showModal 的 editable 已弃用）
  onChipAdd() {
    this.setData({ addChipVisible: true, qtyDialogVisible: false });
  },

  onChipAddClose() {
    this.setData({ addChipVisible: false });
  },

  onChipAddConfirm(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const name = (e.detail?.value || '').trim();
    this.setData({ addChipVisible: false });
    if (!name) return;
    const chips = this.data.chips.concat({
      id: `c${Date.now()}`,
      name,
      quantity: '',
      emoji: emojiFor(name),
    });
    this.setData({ chips });
  },

  // 点食材数量徽 → 弹层编辑数量（input-dialog）
  onEditChipQty(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    const chip = this.data.chips.find(c => c.id === id);
    if (!chip) return;
    this.setData({ qtyDialogVisible: true, addChipVisible: false, editingQtyId: id, editingQtyValue: chip.quantity || '' });
  },
  onQtyDialogClose() {
    this.setData({ qtyDialogVisible: false, editingQtyId: '' });
  },
  onQtyDialogConfirm(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const value = (e.detail?.value || '').trim();
    const id = this.data.editingQtyId;
    this.setData({ qtyDialogVisible: false, editingQtyId: '' });
    if (!id) return;
    this.setData({ chips: this.data.chips.map(c => (c.id === id ? { ...c, quantity: value } : c)) });
  },

  // 生成推荐：调后端按食材+成员口味出菜单（先库内匹配，不足 AI 补），切到推荐阶段
  async onGenerateTap() {
    if (!this.data.chips.length) {
      wx.showToast({ title: '请先识别或添加食材', icon: 'none' });
      return;
    }
    if (this.data.recommending) return;
    const ingredients = this.data.chips.map(c => c.name);
    this.setData({ recommending: true });
    try {
      const res = await recipeApi.recommendDishes(ingredients, 6);
      const recommendations: DishRec[] = (res.dishes || []).map(d => ({
        title: d.title,
        reason: d.reason || '',
        source: d.source || 'ai',
        recipe_id: d.recipe_id ? String(d.recipe_id) : '',
      }));
      if (!recommendations.length) {
        wx.showToast({ title: '没有合适推荐，换些食材试试', icon: 'none' });
        return;
      }
      this.setData({ recommendations, recoPhase: 'recos', sheetOpen: true });
    } catch (e) {
      console.error('[snap] recommend fail', e);
    } finally {
      this.setData({ recommending: false });
    }
  },

  // 从推荐列表返回去修改识别食材
  onBackToChips() {
    this.setData({ recoPhase: 'chips' });
  },

  // 识别结果「⋯」拓展菜单：另存为冰箱食材 / 加入采购清单
  onMoreActions() {
    if (!this.data.chips.length) {
      wx.showToast({ title: '请先识别或添加食材', icon: 'none' });
      return;
    }
    const chips = this.data.chips;
    wx.showActionSheet({
      itemList: ['另存为冰箱食材', '加入采购清单计划'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          try {
            await inventoryStore.upsert(chips.map(c => ({ name: c.name, kind: 'manual', quantity_text: c.quantity || undefined })));
            wx.showToast({ title: '已存入冰箱', icon: 'success' });
          } catch (e) {
            console.error('[snap] add inventory fail', e);
            wx.showToast({ title: '添加失败', icon: 'none' });
          }
        } else if (res.tapIndex === 1) {
          try {
            await kitchenApi.addShoppingItems(chips.map(c => ({ name: c.name, quantity_text: c.quantity })));
            wx.showToast({ title: '已加入采购清单', icon: 'success' });
          } catch (e) {
            console.error('[snap] add shopping fail', e);
            wx.showToast({ title: '添加失败', icon: 'none' });
          }
        }
      },
    });
  },

  // 选一道推荐菜 → 把「这道菜 + 现有食材」带进厨艺助理，AI 生成完整做法（recipe_card→编辑页已通）
  async onPickReco(e: WechatMiniprogram.BaseEvent) {
    const idx = Number((e.currentTarget as unknown as { dataset: { idx: string } }).dataset.idx);
    const dish = this.data.recommendations[idx];
    if (!dish) return;
    const ingredients = this.data.chips.map(c => c.name).join('、');
    const recipeIdNum = dish.recipe_id ? Number(dish.recipe_id) : undefined;
    // 库内已有的菜带上 recipe_id 让助理参考现有菜谱（不必从零重写）；AI 新菜则请求完整生成
    const text = dish.recipe_id
      ? `我想做家里已有的「${dish.title}」，现在有这些食材：${ingredients}。请结合现有菜谱给我做法或改良建议。`
      : `我想做「${dish.title}」，现在有这些食材：${ingredients}。请帮我生成完整做法（含每样用量、每步预计时长和完成判断）。`;

    this.setData({ sheetOpen: false });
    chatStore.openSheet({
      scene: 'recipe_workbench',
      recipe_id: dish.recipe_id || undefined,
      quote_context: { scene: 'recipe_workbench', surrounding_text: dish.title },
    });
    chatStore.setSheetExpanded(true); // 立即展开，避免空会话先收起再展开的闪烁
    // 与 ai-sheet 一致：先确保会话存在再发送（后端 /chat/send 也会兜底自动建会话）
    if (!chatStore.session) {
      try {
        const reply = await aiApi.createSession({ scene: 'recipe_workbench', title: '拍照推荐', recipe_id: recipeIdNum });
        chatStore.setSession(reply.session);
      } catch (err) {
        console.warn('[snap] create session fail, fallback to auto-create', err);
      }
    }
    chatStore.send(text, { scene: 'recipe_workbench', recipe_id: recipeIdNum });
  },

  onRetake() {
    this.setData({
      captured: false,
      recognizing: false,
      recognized: false,
      chips: [],
      error: '',
      capturedPath: '',
      recoPhase: 'chips',
      recommendations: [],
    });
  },

  onCameraReady() {
    console.info('[snap] camera init done');
    if (this.data.cameraBroken) {
      this.setData({ cameraBroken: false, error: '' });
    }
  },

  onCameraError(e: WechatMiniprogram.CustomEvent) {
    // 相机权限拒绝 / 被其它应用占用 / 硬件不可用：记录详情并提供相册降级
    console.error('[snap] camera error', e?.detail);
    this.setData({
      cameraBroken: true,
      error: '相机不可用（可能被占用或未授权）',
    });
  },

  // 相册降级入口（相机坏掉时的显式按钮）
  onPickAlbum() {
    this.pickFromAlbum();
  },
});

function getFileInfo(path: string): Promise<{ size: number }> {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getFileInfo({
      filePath: path,
      success: (res) => resolve({ size: res.size }),
      fail: () => resolve({ size: 0 }),
    });
  });
}

// 从 ImportJob 抽取识别到的食材（名称 + AI 给的数量 amount_text）
function extractIngredients(job: ImportJob): Array<{ name: string; quantity: string }> {
  const raw: Array<{ name: string; quantity: string }> = [];
  const meta = (job as unknown as { normalized_payload?: Record<string, unknown>; result?: Record<string, unknown> });
  const tryArr = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === 'string') {
        raw.push({ name: item, quantity: '' });
      } else if (item && typeof (item as { name?: string }).name === 'string') {
        const it = item as { name: string; amount_text?: string };
        raw.push({ name: it.name, quantity: (it.amount_text || '').trim() });
      }
    }
  };
  if (meta.normalized_payload && typeof meta.normalized_payload === 'object') {
    const np = meta.normalized_payload as Record<string, unknown>;
    tryArr(np.detected_ingredients);
    // 后端把识别草稿存在 normalized_payload.draft（旧字段 recipe_draft 兜底）
    const draft = (np.draft || np.recipe_draft) as { ingredients?: unknown } | undefined;
    if (draft) tryArr(draft.ingredients);
  }
  if (!raw.length && meta.result && typeof meta.result === 'object') {
    const r = meta.result as Record<string, unknown>;
    tryArr(r.detected_ingredients);
    const draft = (r.draft || r.recipe_draft) as { ingredients?: unknown } | undefined;
    if (draft) tryArr(draft.ingredients);
  }
  // 按名去重 + trim
  const seen = new Set<string>();
  const out: Array<{ name: string; quantity: string }> = [];
  for (const ing of raw) {
    const t = (ing.name || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push({ name: t, quantity: ing.quantity });
  }
  return out;
}
