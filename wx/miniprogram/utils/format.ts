// 数量、字符串等通用格式化

// 数量+单位（如 "300克"、"1.5份"），单位为空时只显示数量
export function formatQty(quantity: number, unit?: string): string {
  if (!Number.isFinite(quantity)) return '';
  // 整数省略小数点
  const num = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
  return unit ? `${num}${unit}` : num;
}

// 截断字符串，超长加省略号
export function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// 安全 JSON 解析；失败返回 fallback
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (_) {
    return fallback;
  }
}
