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

// 难度 1-5 → 文案；缺失返回空串（不显示，不造假）
export function difficultyLabel(d?: number): string {
  if (!d) return '';
  if (d <= 2) return '简单';
  if (d === 3) return '中等';
  return '较难';
}

// 菜谱卡片副标题：只拼真实存在的字段（proto Recipe 没有 servings 等字段，不要编造）
export function recipeMetaLabel(r: { total_minutes?: number; difficulty?: number; category?: string }): string {
  const parts: string[] = [];
  if (r.category) parts.push(r.category);
  if (r.total_minutes) parts.push(`${r.total_minutes}分钟`);
  const dl = difficultyLabel(r.difficulty);
  if (dl) parts.push(dl);
  return parts.join(' · ');
}
