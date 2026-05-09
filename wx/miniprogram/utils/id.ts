// 客户端 ID 生成：用于 client_msg_id（保证消息幂等去重）

let counter = 0;

// 生成简短的 12 位 base36 ID：时间戳后 8 位 + 计数器 4 位
export function nextClientId(): string {
  counter = (counter + 1) % 0xFFFF;
  const ts = Date.now().toString(36).slice(-8);
  const c = counter.toString(36).padStart(4, '0');
  return `${ts}${c}`;
}
