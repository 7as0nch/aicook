// 做菜步骤（阶段 4 实现）
Page({
  data: { id: '' },
  onLoad(query: Record<string, string>) {
    this.setData({ id: query.id || '' });
  },
});
