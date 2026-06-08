// 烹饪历史（设计稿"连续打卡"入口）
// 时间分组列表 + 下拉加载更多
import { kitchenApi } from '../../../../services/kitchen.api';
import type { CookingHistoryEntry, Int64Like } from '../../../../types/api';

interface GroupedHistory {
  title: string;
  items: Array<CookingHistoryEntry & { displayTime: string; durationLabel: string; ratingStars: string }>;
}

const PAGE_SIZE = 20;

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtTime(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDuration(sec: number) {
  if (!sec) return '0 分钟';
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`;
  return `${Math.floor(sec / 3600)} 时 ${Math.round((sec % 3600) / 60)} 分`;
}
function fmtStars(rating: number) {
  if (!rating) return '';
  const r = Math.max(0, Math.min(5, rating));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function groupByDay(items: CookingHistoryEntry[]): GroupedHistory[] {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const groups = new Map<string, GroupedHistory>();
  for (const it of items) {
    const t = it.completed_at || it.started_at;
    if (!t) continue;
    const d = new Date(t);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let title = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    if (key === todayKey) title = '今天';
    else if (key === yKey) title = '昨天';
    else if (d > weekAgo) title = '本周';
    if (!groups.has(title)) groups.set(title, { title, items: [] });
    groups.get(title)!.items.push({
      ...it,
      displayTime: fmtTime(d.getTime()),
      durationLabel: fmtDuration(it.duration_seconds || 0),
      ratingStars: fmtStars(it.rating || 0),
    });
  }
  return Array.from(groups.values());
}

Page({
  data: {
    groups: [] as GroupedHistory[],
    streakDays: 0,
    totalCount: 0,
    loading: false,
    hasMore: true,
    rawItems: [] as CookingHistoryEntry[],
  },

  onLoad() {
    void this.loadFirst();
  },

  async onPullDownRefresh() {
    await this.loadFirst();
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    const last = this.data.rawItems[this.data.rawItems.length - 1];
    if (!last) return;
    await this.loadMore(last.id);
  },

  async loadFirst() {
    this.setData({ loading: true });
    try {
      const res = await kitchenApi.listCookingHistory(PAGE_SIZE);
      const items = res.entries || [];
      this.setData({
        rawItems: items,
        groups: groupByDay(items),
        totalCount: items.length,
        streakDays: this.computeStreak(items),
        hasMore: items.length === PAGE_SIZE,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMore(beforeId: Int64Like) {
    this.setData({ loading: true });
    try {
      const res = await kitchenApi.listCookingHistory(PAGE_SIZE, beforeId);
      const more = res.entries || [];
      const combined = [...this.data.rawItems, ...more];
      this.setData({
        rawItems: combined,
        groups: groupByDay(combined),
        totalCount: combined.length,
        hasMore: more.length === PAGE_SIZE,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  computeStreak(items: CookingHistoryEntry[]): number {
    if (!items.length) return 0;
    const set = new Set<string>();
    for (const it of items) {
      const t = it.completed_at || it.started_at;
      if (!t) continue;
      const d = new Date(t);
      set.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    }
    let streak = 0;
    const cursor = new Date();
    while (true) {
      const k = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
      if (set.has(k)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        if (streak === 0) {
          cursor.setDate(cursor.getDate() - 1);
          const k2 = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
          if (!set.has(k2)) break;
          continue;
        }
        break;
      }
    }
    return streak;
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (id) wx.navigateTo({ url: `/pages/recipes/detail/index?id=${id}` });
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.switchTab({ url: '/pages/me/index/index' }));
  },
});
