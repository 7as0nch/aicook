// 关于页：项目介绍 + AI 能力说明 + 协议文档入口 + 联系方式
import { openLegalDoc, type LegalDocKey } from '../../../utils/legal';

Page({
  // 打开法律文档（用户协议 / 隐私政策 / 医疗与营养免责声明）
  onDocTap(e: WechatMiniprogram.BaseEvent) {
    const key = (e.currentTarget as unknown as { dataset: { key: LegalDocKey } }).dataset.key;
    openLegalDoc(key);
  },

  // 复制联系邮箱
  onCopyEmail() {
    wx.setClipboardData({
      data: '7as0nch@gmail.com',
      success: () => wx.showToast({ title: '邮箱已复制', icon: 'success' }),
    });
  },
});
