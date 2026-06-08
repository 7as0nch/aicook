// 全局品牌名 / 标语 / 文案常量
// 改名只需要改这一个文件，所有 wxml 通过 page data 注入 brand 字段即可。
// app.json 的 navigationBarTitleText 是静态值，无法用变量；改名时一并修改 app.json。

export const BRAND = {
  // 品牌名（显示在 navigation bar、登录页、关于页等）
  name: 'aicook',
  // 副标语（登录页副标题、AI 助理介绍等）
  tagline: 'AI 智能厨房助手',
  // 长标题（分享卡片）
  fullTitle: 'aicook · AI 智能厨房',
  // 厨房名后缀（注册时默认 household 名称）
  householdSuffix: '的厨房',
} as const;

// 便利函数：注入到 page data
export function injectBrand(setData: (d: object) => void): void {
  setData({ brand: BRAND });
}

// 便利函数：动态设置 navigation bar title
export function setBrandTitle(): void {
  try {
    wx.setNavigationBarTitle({ title: BRAND.name });
  } catch (_) {}
}
