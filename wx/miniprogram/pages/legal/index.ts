// 法律文档原生展示页：按 key 渲染内置文档内容（rich-text），不跳转外部网页。
import { LEGAL_CONTENT } from '../../utils/legal-content';
import type { LegalDocKey } from '../../utils/legal';

Page({
  data: {
    title: '',
    nodes: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const key = (query.key || '') as LegalDocKey;
    const doc = LEGAL_CONTENT[key];
    if (!doc) {
      this.setData({ title: '文档', nodes: '<p style="padding:40rpx;color:#9B978F">文档不存在</p>' });
      return;
    }
    this.setData({ title: doc.title, nodes: doc.html });
  },
});
