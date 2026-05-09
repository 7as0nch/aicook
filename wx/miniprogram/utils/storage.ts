// 类型安全的本地存储封装
// 使用 wx.setStorageSync / wx.getStorageSync，错误时降级返回 null

export const STORAGE_KEYS = {
  AUTH: 'aicook:auth',                    // { token, user, currentHousehold }
  RECENT_KEYWORDS: 'aicook:recent:kw',    // string[]
  RECIPE_DRAFT: 'aicook:recipe:draft',    // 详情页食材勾选草稿
  ACTIVE_COOKING: 'aicook:cooking:active',// 本地烹饪进度备份
} as const;

export function getItem<T>(key: string): T | null {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === undefined || v === null) return null;
    return v as T;
  } catch (e) {
    console.warn('[storage] getItem fail', key, e);
    return null;
  }
}

export function setItem<T>(key: string, value: T): void {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.warn('[storage] setItem fail', key, e);
  }
}

export function removeItem(key: string): void {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    console.warn('[storage] removeItem fail', key, e);
  }
}

export function clearAll(): void {
  try {
    wx.clearStorageSync();
  } catch (e) {
    console.warn('[storage] clearAll fail', e);
  }
}
