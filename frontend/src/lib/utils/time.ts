/*
 * @Author: chengjiang
 * @Date: 2026-03-31 10:01:31
 * @Description: 
 */
/**
 * 格式化时间戳为友好的显示格式
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化后的时间字符串
 * 
 * 规则：
 * - 今天：只显示时间（如：14:30）
 * - 昨天：昨天 + 时间（如：昨天 14:30）
 * - 前天：前天 + 时间（如：前天 14:30）
 * - 今年内：月-日 + 时间（如：11-20 14:30）
 * - 今年之前：年-月-日 + 时间（如：2023-11-20 14:30）
 */
/**
 * 安全地将时间戳转换为数字（毫秒）
 * @param timestamp 时间戳（可能是数字或字符串）
 * @returns 毫秒级时间戳数字
 */
function normalizeTimestamp(timestamp: string | number): number {
    if (typeof timestamp === 'number') {
        let ts = timestamp
        if (ts < 100000000000) {
            ts *= 1000
        }
        return ts
    }
    const trimmed = timestamp.trim()
    const fromIso = Date.parse(trimmed)
    if (!Number.isNaN(fromIso)) {
        return fromIso
    }
    let ts = parseInt(trimmed, 10)
    if (Number.isNaN(ts)) {
        return 0
    }
    if (ts < 100000000000) {
        ts *= 1000
    }
    return ts
}

/**
 * 格式化时间戳为友好的显示格式
 * @param timestamp 时间戳（毫秒或字符串）
 * @returns 格式化后的时间字符串
 * 
 * 规则：
 * - 今天：只显示时间（如：14:30）
 * - 昨天：昨天 + 时间（如：昨天 14:30）
 * - 前天：前天 + 时间（如：前天 14:30）
 * - 今年内：月-日 + 时间（如：11-20 14:30）
 * - 今年之前：年-月-日 + 时间（如：2023-11-20 14:30）
 */
export function formatMessageTime(timestamp: string | number): string {
    const ts = normalizeTimestamp(timestamp);
    const now = new Date();
    const msgDate = new Date(ts);

    // 获取今天的开始时间（00:00:00）
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStartTime = todayStart.getTime();

    // 获取昨天的开始时间
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayStartTime = yesterdayStart.getTime();

    // 获取前天的开始时间
    const dayBeforeYesterdayStart = new Date(todayStart);
    dayBeforeYesterdayStart.setDate(dayBeforeYesterdayStart.getDate() - 2);
    const dayBeforeYesterdayStartTime = dayBeforeYesterdayStart.getTime();

    // 获取今年的开始时间
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const thisYearStartTime = thisYearStart.getTime();

    // 格式化时间部分（HH:MM）
    const hours = msgDate.getHours().toString().padStart(2, '0');
    const minutes = msgDate.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    // 判断时间范围并返回相应格式
    if (ts >= todayStartTime) {
        // 今天：只显示时间
        return timeStr;
    } else if (ts >= yesterdayStartTime) {
        // 昨天
        return `昨天 ${timeStr}`;
    } else if (ts >= dayBeforeYesterdayStartTime) {
        // 前天
        return `前天 ${timeStr}`;
    } else if (ts >= thisYearStartTime) {
        // 今年内：月-日 时间
        const month = (msgDate.getMonth() + 1).toString().padStart(2, '0');
        const day = msgDate.getDate().toString().padStart(2, '0');
        return `${month}-${day} ${timeStr}`;
    } else {
        // 今年之前：年-月-日 时间
        const year = msgDate.getFullYear();
        const month = (msgDate.getMonth() + 1).toString().padStart(2, '0');
        const day = msgDate.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${timeStr}`;
    }
}

/**
 * 格式化完整的日期时间
 * @param timestamp 时间戳（毫秒或字符串）
 * @returns 完整的日期时间字符串（如：2024-11-20 14:30:25）
 */
export function formatFullDateTime(timestamp: string | number): string {
    const ts = normalizeTimestamp(timestamp);
    const date = new Date(ts);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取相对时间描述
 * @param timestamp 时间戳（毫秒或字符串）
 * @returns 相对时间描述（如：刚刚、5分钟前、1小时前）
 */
export function getRelativeTime(timestamp: string | number): string {
    const ts = normalizeTimestamp(timestamp);
    const now = Date.now();
    const diff = now - ts;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
        return '刚刚';
    } else if (minutes < 60) {
        return `${minutes}分钟前`;
    } else if (hours < 24) {
        return `${hours}小时前`;
    } else if (days < 7) {
        return `${days}天前`;
    } else {
        return formatMessageTime(ts);
    }
}
