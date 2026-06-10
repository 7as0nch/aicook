// 拍照识别页（设计稿 02）
// 流程：相机取景器 → takePhoto → uploadFile → importApi.createImageRecipe →
//      poll getImportJob → 抽取食材 chips → "✨ 生成推荐菜谱" CTA 跳今日推荐页
import { importApi } from '../../../services/import.api';
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
    statusBarHeight: 20,
    capturedPath: '',
    error: '',
    sheetOpen: false,            // 抽屉是否展开：默认收起
  },

  onLoad() {
    const info = wx.getWindowInfo?.() || wx.getSystemInfoSync();
    this.setData({ statusBarHeight: (info as any).statusBarHeight || 20 });
  },

  onReady() {
    this.cameraCtx = wx.createCameraContext();
  },

  onUnload() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => {
      wx.switchTab({ url: '/pages/home/index/index' });
    });
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
      fail: () => this.pickFromAlbum(),
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
      const asset = await uploadFile({
        tempFilePath: tempPath,
        mediaKind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: info.size,
      });
      // 2. 创建识别任务
      const created = await importApi.createImageRecipe([String(asset.id)]);
      // 3. 轮询
      const final = await this.pollJob(created.job.id);
      // 4. 抽取食材 chip
      const names = extractIngredientNames(final);
      const chips: IngredChip[] = names.map((name, i) => ({
        id: `c${i}`,
        name,
        emoji: emojiFor(name),
      }));
      // 识别完成自动展开抽屉
      this.setData({ recognizing: false, recognized: true, chips, sheetOpen: true });
    } catch (err) {
      console.error('process image error', err);
      this.setData({
        recognizing: false,
        recognized: false,
        error: '识别失败，请重试',
      });
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
          const status = (job.status || '').toLowerCase();
          if (status === 'success' || status === 'completed') {
            resolve(job);
            return;
          }
          if (status === 'failed' || status === 'error') {
            reject(new Error(job.error_message || '识别失败'));
            return;
          }
          if (Date.now() - start > TIMEOUT) {
            reject(new Error('识别超时'));
            return;
          }
          this.pollTimer = setTimeout(tick, 1500);
        } catch (e) {
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

  onChipAdd() {
    wx.showModal({
      title: '添加食材',
      placeholderText: '请输入食材名称',
      editable: true,
      success: (res) => {
        if (!res.confirm || !res.content) return;
        const name = res.content.trim();
        if (!name) return;
        const chips = this.data.chips.concat({
          id: `c${Date.now()}`,
          name,
          emoji: emojiFor(name),
        });
        this.setData({ chips });
      },
    });
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

  onCameraError() {
    // 相机权限拒绝或不可用：退到相册选择
    this.setData({ error: '相机不可用，请从相册选择图片' });
  },
});

function getFileInfo(path: string): Promise<{ size: number }> {
  return new Promise((resolve) => {
    (wx as any).getFileInfo({
      filePath: path,
      success: (res: { size: number }) => resolve({ size: res.size }),
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
