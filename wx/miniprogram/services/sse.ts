// SSE 流式封装
// 后端 /chat/send 是 POST + SSE，事件帧格式：
//   event: answer_delta\n
//   data: {"content":"...","seq":1,"part_type":"text"}\n
//   \n
// 微信小程序通过 wx.request({enableChunked: true}) + onChunkReceived 接收流。
// 本模块负责：拼装请求、读 chunk、按 \n\n 切帧、按 event/data 解析为对象，回调上层。

import { prepareRaw } from './http';

// SSE 事件类型（与后端 chat_http.go 中的 SSE writer 对齐）
export type SSEEventType =
  | 'start'
  | 'answer_delta'
  | 'reasoning_delta'
  | 'status_delta'
  | 'tool_call'
  | 'recipe_card'
  | 'agent_delta'
  | 'approval'
  | 'done'
  | 'error';

export interface SSEEvent<T = unknown> {
  event: SSEEventType;
  data: T;
  raw: string;
}

export interface ChatSendRequest {
  session_id?: string;
  scene?: string;
  title?: string;
  recipe_id?: number;
  context?: Record<string, unknown>;
  text: string;
  attachments?: unknown[];
  quote_context?: Record<string, unknown>;
  reasoning_enabled?: boolean;
  web_search_enabled?: boolean;
  image_recipe_enabled?: boolean;
}

export interface SSEHandlers {
  onEvent: (ev: SSEEvent) => void;        // 每帧回调
  onDone?: () => void;                    // 整体结束（success 或 done 帧后由调用方触发）
  onError?: (err: { code: number; message: string }) => void;
}

export interface SSETask {
  abort: () => void;
}

// 解码 ArrayBuffer → utf-8 字符串
function decodeChunk(buf: ArrayBuffer): string {
  // 微信小程序无 TextDecoder，需手写 utf-8 解码
  const bytes = new Uint8Array(buf);
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      s += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xc0) {
      // 半字节，不应出现在帧首
      i += 1;
    } else if (b < 0xe0) {
      s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      s += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      // 4 字节字符 → 转 UTF-16 surrogate pair
      const code =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      const adj = code - 0x10000;
      s += String.fromCharCode(0xd800 + (adj >> 10), 0xdc00 + (adj & 0x3ff));
      i += 4;
    }
  }
  return s;
}

// 解析单个 SSE 帧文本（不含尾部 \n\n）
function parseFrame(raw: string): SSEEvent | null {
  const lines = raw.split('\n');
  let event: string | null = null;
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // 注意：不能用 trim()，否则会丢弃 SSE 数据本身的空白
      data += line.slice(5).replace(/^\s/, '');
    }
  }
  if (!event) return null;
  let parsed: unknown = data;
  try {
    parsed = JSON.parse(data);
  } catch (_) {
    // 保持原始字符串
  }
  return { event: event as SSEEventType, data: parsed, raw };
}

// 简单 SDKVersion 比较；返回 a-b 的符号
function compareVersion(a: string, b: string): number {
  const av = (a || '0.0.0').split('.').map((x) => Number(x) || 0);
  const bv = (b || '0.0.0').split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const ai = av[i] || 0;
    const bi = bv[i] || 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

let _sdkChecked = false;
function ensureSDKVersion(): boolean {
  if (_sdkChecked) return true;
  try {
    const info = wx.getSystemInfoSync();
    if (compareVersion(info.SDKVersion || '0.0.0', '2.10.0') < 0) {
      wx.showModal({
        title: '版本过低',
        content: `当前微信基础库 ${info.SDKVersion} 不支持流式聊天，请升级微信到最新版`,
        showCancel: false,
      });
      return false;
    }
  } catch (_) {
    // ignore
  }
  _sdkChecked = true;
  return true;
}

// 发起一次流式 chat 请求
export function chatStream(req: ChatSendRequest, handlers: SSEHandlers): SSETask {
  if (!ensureSDKVersion()) {
    const err = { code: -2, message: 'SDKVersion 过低，无法发送' };
    handlers.onError?.(err);
    return { abort: () => {} };
  }
  const prep = prepareRaw('/chat/send', {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  });
  let buffer = '';
  let aborted = false;
  let receivedAnyChunk = false;

  console.debug('[chatStream] POST', prep.url, JSON.stringify({ ...req, attachments: req.attachments ? `(${req.attachments.length})` : undefined }));

  const task = wx.request({
    url: prep.url,
    method: 'POST',
    header: prep.header,
    data: req as unknown as WechatMiniprogram.IAnyObject,
    enableChunked: true,
    responseType: 'arraybuffer',
    success: (res) => {
      if (aborted) return;
      // 处理 buffer 中残留的最后一帧（如果未以 \n\n 结尾）
      flushBuffer();
      const status = (res as { statusCode?: number }).statusCode;
      if (status && status >= 400) {
        const msg = `HTTP ${status}`;
        console.error('[chatStream] non-2xx', status, res);
        wx.showToast({ title: msg, icon: 'none', duration: 3000 });
        handlers.onError?.({ code: status, message: msg });
        return;
      }
      if (!receivedAnyChunk) {
        // 后端返回了但没收到任何 chunk，可能是基础库不支持 chunked
        const msg = '流式响应为空，请检查基础库版本（≥2.10.0）';
        console.warn('[chatStream] success but no chunk received');
        wx.showToast({ title: msg, icon: 'none', duration: 3000 });
        handlers.onError?.({ code: -3, message: msg });
        return;
      }
      handlers.onDone?.();
    },
    fail: (err) => {
      if (aborted) return;
      const msg = err.errMsg || 'AI 请求失败';
      console.error('[chatStream] fail:', msg, err);
      wx.showToast({ title: msg, icon: 'none', duration: 3000 });
      handlers.onError?.({ code: -1, message: msg });
    },
  });

  const onChunk = (res: { data: ArrayBuffer }): void => {
    if (aborted) return;
    receivedAnyChunk = true;
    buffer += decodeChunk(res.data);
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!frame.trim()) continue;
      const ev = parseFrame(frame);
      if (ev) {
        console.debug('[SSE]', ev.event, ev.data);
        handlers.onEvent(ev);
      }
    }
  };

  const flushBuffer = (): void => {
    if (!buffer.trim()) return;
    const ev = parseFrame(buffer);
    if (ev) {
      console.debug('[SSE flush]', ev.event, ev.data);
      handlers.onEvent(ev);
    }
    buffer = '';
  };

  // 微信类型签名：RequestTask 提供 onChunkReceived
  (task as WechatMiniprogram.RequestTask).onChunkReceived(onChunk);

  return {
    abort: () => {
      aborted = true;
      try {
        task.abort();
      } catch (_) {
        // ignore
      }
    },
  };
}
