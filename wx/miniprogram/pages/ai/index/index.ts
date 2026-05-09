// AI 助理（Tab 4）：会话列表
Page({
  data: {
    sessions: [] as unknown[],
  },

  onNewChat() {
    wx.navigateTo({ url: '/pages/ai/chat/index' });
  },
});
