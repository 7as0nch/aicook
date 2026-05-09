// AI 对话详情（阶段 6 实现 SSE 流式）
Page({
  data: { sessionId: '' },
  onLoad(query: Record<string, string>) {
    this.setData({ sessionId: query.session_id || '' });
  },
});
