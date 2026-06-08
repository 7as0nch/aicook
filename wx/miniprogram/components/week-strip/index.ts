// 周日期条：本周 7 天，今天高亮。weekStartDate 是周一日期 YYYY-MM-DD
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Component({
  properties: {
    // 本周起始日（周一），YYYY-MM-DD
    weekStartDate: { type: String, value: '' },
    // 当前选中日期 YYYY-MM-DD
    selectedDate: { type: String, value: '' },
    // 是否使用周一/周日切换；这里固定从周一开始
  },
  data: {
    days: [] as Array<{ date: string; weekLabel: string; dayLabel: string; isToday: boolean; isSelected: boolean }>,
    todayStr: '',
  },
  observers: {
    'weekStartDate, selectedDate': function () {
      this.recompute();
    },
  },
  lifetimes: {
    attached() {
      this.recompute();
    },
  },
  methods: {
    recompute() {
      const ws = this.data.weekStartDate;
      const sel = this.data.selectedDate;
      const today = new Date();
      const todayStr = formatDate(today);
      let baseDate: Date;
      if (ws) {
        baseDate = new Date(ws + 'T00:00:00');
      } else {
        const d = new Date(today);
        const w = (d.getDay() + 6) % 7; // 周一为 0
        d.setDate(d.getDate() - w);
        baseDate = d;
      }
      const days = [] as Array<{ date: string; weekLabel: string; dayLabel: string; isToday: boolean; isSelected: boolean }>;
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i);
        const dateStr = formatDate(d);
        days.push({
          date: dateStr,
          weekLabel: WEEK_LABELS[i],
          dayLabel: String(d.getDate()),
          isToday: dateStr === todayStr,
          isSelected: dateStr === sel,
        });
      }
      this.setData({ days, todayStr });
    },
    onTap(e: WechatMiniprogram.BaseEvent) {
      const data = (e.currentTarget as unknown as { dataset: { date: string } }).dataset;
      this.triggerEvent('change', { date: data.date });
    },
  },
});
