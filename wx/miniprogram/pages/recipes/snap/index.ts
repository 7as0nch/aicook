// 拍照识别页（设计稿 02）
// 流程：相机取景器 → takePhoto → uploadFile → importApi.createImageRecipe →
//      poll getImportJob → 抽取食材 chips → "✨ 生成推荐菜谱" CTA 跳今日推荐页
import { importApi, isImportJobDone, isImportJobFailed } from '../../../services/import.api';
import { uploadFile } from '../../../services/upload';
import { emojiFor } from '../../../utils/food-emoji';
import type { ImportJob } from '../../../types/api';

interface IngredChip {
  id: string;
  emoji: string;
  name: string;
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
      // 4. 抽取食材 chip
      const names = extractIngredientNames(final);
      console.info('[snap] recognized ingredients:', names);
      const chips: IngredChip[] = names.map((name, i) => ({
        id: `c${i}`,
        name,
        emoji: emojiFor(name),
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

  // 添加食材：自定义弹层（wx.showModal 的 editable 已弃用）
  onChipAdd() {
    this.setData({ addChipVisible: true });
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
      emoji: emojiFor(name),
    });
    this.setData({ chips });
  },

  onGenerateTap() {
    if (!this.data.chips.length) {
      wx.showToast({ title: '请先识别或添加食材', icon: 'none' });
      return;
    }
    const ingredients = this.data.chips.map(c => c.name).join(',');
    wx.navigateTo({
      url: `/pages/recipes/today/index?ingredients=${encodeURIComponent(ingredients)}`,
    });
  },

  onRetake() {
    this.setData({
      captured: false,
      recognizing: false,
      recognized: false,
      chips: [],
      error: '',
      capturedPath: '',
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

// 从 ImportJob 中抽取识别到的食材名称
function extractIngredientNames(job: ImportJob): string[] {
  const names: string[] = [];
  const meta = (job as unknown as { normalized_payload?: Record<string, unknown>; input_payload?: Record<string, unknown>; result?: Record<string, unknown> });
  // 1. 优先看 normalized_payload.recipe_draft.ingredients
  const tryArr = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === 'string') names.push(item);
      else if (item && typeof (item as { name?: string }).name === 'string') {
        names.push((item as { name: string }).name);
      }
    }
  };
  if (meta.normalized_payload && typeof meta.normalized_payload === 'object') {
    const np = meta.normalized_payload as Record<string, unknown>;
    tryArr(np.detected_ingredients);
    const draft = np.recipe_draft as { ingredients?: unknown } | undefined;
    if (draft) tryArr(draft.ingredients);
  }
  if (!names.length && meta.result && typeof meta.result === 'object') {
    const r = meta.result as Record<string, unknown>;
    tryArr(r.detected_ingredients);
    const draft = r.recipe_draft as { ingredients?: unknown } | undefined;
    if (draft) tryArr(draft.ingredients);
  }
  // 去重 + trim
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = (n || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
