// 进度条
Component({
  properties: {
    current: { type: Number, value: 0 },
    total: { type: Number, value: 100 },
    color: { type: String, value: '' }, // 自定义颜色；空则用 primary
  },
  data: {
    percent: 0,
  },
  observers: {
    'current, total': function (c: number, t: number) {
      const p = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0;
      this.setData({ percent: p });
    },
  },
});
