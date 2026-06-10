// 时间格式化与计算

export function nowMs(): number {
  return Date.now();
}

// 将秒数格式化为 mm:ss（用于做菜计时器）
export function formatDuration(totalSec: number): string {
  if (totalSec < 0) totalSec = 0;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

// 将分钟数转可读时长（用于菜谱时长展示，如"35分钟"、"1小时20分"）
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}小时` : `${h}小时${m}分`;
}

// 相对时间（如"3 分钟前"），用于历史/会话列表
export function formatRelative(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`;
  const d = new Date(timestampMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 一周的开始（周一 00:00:00），返回本地时区毫秒
export function weekStartOf(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1; // 让周一=0
  d.setDate(d.getDate() - dayOfWeek);
  return d.getTime();
}

// 本地时区日期 key（yyyy-MM-dd），用于打卡/按天分组等"自然日"计算。
// 注意用本地 getter 而非 toISOString()（后者是 UTC，跨时区会差一天）。
export function localDateKey(input: Date | number | string): string {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 连续打卡天数：从今天（若今天还没打卡则从昨天）起，往前数连续有记录的自然日。
// times 传记录的时间戳（RFC3339 字符串或毫秒），无效值自动跳过。
export function computeStreakDays(times: Array<string | number | undefined>): number {
  const dayKeys = new Set<string>();
  for (const t of times) {
    if (!t) continue;
    dayKeys.add(localDateKey(t));
  }
  if (!dayKeys.size) return 0;
  let streak = 0;
  const cursor = new Date();
  if (!dayKeys.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (;;) {
    if (!dayKeys.has(localDateKey(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
