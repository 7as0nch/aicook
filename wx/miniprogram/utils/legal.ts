// 法律文档（用户协议 / 隐私政策 / 医疗与营养免责声明）。
// 内容内置在小程序内，通过 pages/legal 原生页用 rich-text 渲染，不跳转任何外部网页。
// 文档正文见 utils/legal-content.ts（由 doc/*.md 转换而来）。

export type LegalDocKey = 'user-agreement' | 'privacy-policy' | 'disclaimer';

// 打开指定法律文档（小程序内原生页）
export function openLegalDoc(key: LegalDocKey): void {
  wx.navigateTo({ url: `/pages/legal/index?key=${key}` });
}
