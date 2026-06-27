// 意见反馈 - 反馈中心 / 我的反馈列表
// 顶部「我要反馈」CTA + 下方游标分页的历史列表（含状态徽章与官方回复）
import { feedbackApi, type Feedback } from '../../../../services/feedback.api';
import { hasToken } from '../../../../utils/auth-guard';

const PAGE_SIZE = 20;
const TTL_MS = 30000;

const CATEGORY_LABELS: Record<string, string> = {
  suggestion: '功能建议',
  bug: '问题反馈',
  other: '其他',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  replied: '已回复',
  closed: '已关闭',
};

interface FeedbackVM extends Feedback {
  categoryLabel: string;
  statusLabel: string;
  statusClass: string;
  timeLabel: string;
  hasImages: boolean;
  hasReply: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toVM(f: Feedback): FeedbackVM {
  const cat = f.category || 'other';
  const st = f.status || 'pending';
  return {
    ...f,
    categoryLabel: CATEGORY_LABELS[cat] || '其他',
    statusLabel: STATUS_LABELS[st] || '待处理',
    statusClass: STATUS_LABELS[st] ? st : 'pending',
    timeLabel: fmtTime(f.created_at),
    hasImages: !!(f.image_urls && f.image_urls.length),
    hasReply: !!(f.admin_reply && f.admin_reply.trim()),
  };
}

Page({
  data: {
    items: [] as FeedbackVM[],
    rawItems: [] as Feedback[],
    loading: false,
    loaded: false,
    hasMore: true,
  },

  onShow() {
    if (!hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' });
      return;
    }
    const now = Date.now();
    const last = (this as unknown as { _lastLoadAt?: number })._lastLoadAt || 0;
    if (!this.data.loaded || now - last > TTL_MS) {
      (this as unknown as { _lastLoadAt?: number })._lastLoadAt = now;
      void this.loadFirst();
    }
  },

  async onPullDownRefresh() {
    await this.loadFirst();
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    const last = this.data.rawItems[this.data.rawItems.length - 1];
    if (!last?.id) return;
    await this.loadMore(last.id);
  },

  async loadFirst() {
    this.setData({ loading: true });
    try {
      const res = await feedbackApi.list({ limit: PAGE_SIZE });
      const items = res.feedbacks || [];
      this.setData({
        rawItems: items,
        items: items.map(toVM),
        loaded: true,
        hasMore: items.length === PAGE_SIZE,
      });
    } catch (e) {
      // http 封装已统一 toast
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMore(beforeId: string) {
    this.setData({ loading: true });
    try {
      const res = await feedbackApi.list({ limit: PAGE_SIZE, before_id: beforeId });
      const more = res.feedbacks || [];
      const combined = [...this.data.rawItems, ...more];
      this.setData({
        rawItems: combined,
        items: combined.map(toVM),
        hasMore: more.length === PAGE_SIZE,
      });
    } catch (e) {
      // http 封装已统一 toast
    } finally {
      this.setData({ loading: false });
    }
  },

  onSubmitTap() {
    wx.navigateTo({ url: '/pages/me/feedback/submit/index' });
  },

  onPreviewImage(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { urls?: string[]; current?: string } }).dataset;
    if (ds.urls && ds.urls.length) {
      wx.previewImage({ urls: ds.urls, current: ds.current });
    }
  },
});
