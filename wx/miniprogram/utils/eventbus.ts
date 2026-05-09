// 极简事件总线：用于跨页面/组件通信（如登录后刷新所有 store）

type Listener = (...args: unknown[]) => void;

const channels: Record<string, Listener[]> = {};

export function on(event: string, fn: Listener): () => void {
  if (!channels[event]) channels[event] = [];
  channels[event].push(fn);
  return () => off(event, fn);
}

export function off(event: string, fn: Listener): void {
  const arr = channels[event];
  if (!arr) return;
  const idx = arr.indexOf(fn);
  if (idx >= 0) arr.splice(idx, 1);
}

export function emit(event: string, ...args: unknown[]): void {
  const arr = channels[event];
  if (!arr) return;
  arr.slice().forEach((fn) => {
    try {
      fn(...args);
    } catch (e) {
      console.error('[eventbus] handler error', event, e);
    }
  });
}

// 业务事件常量
export const EVENTS = {
  AUTH_LOGIN: 'auth:login',                 // 登录成功
  AUTH_LOGOUT: 'auth:logout',               // 退出登录
  HOUSEHOLD_SWITCHED: 'household:switched', // 切换家庭
  AI_OPEN: 'ai:open',                       // 唤起 AI 助理浮球抽屉
  AI_CLOSE: 'ai:close',                     // 关闭 AI 抽屉
} as const;
