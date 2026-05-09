// 统一 HTTP 请求封装
// 职责：
//   1) 拼 URL（基于 utils/env）
//   2) 注入 Authorization 与 X-Household-Id 头
//   3) 解析 Kratos 错误信封 {code, reason, message}
//   4) 401 → 清除登录态 + reLaunch 到登录页（并发锁）
//   5) loading / toast 控制

import { apiUrl } from '../utils/env';
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../utils/storage';
import { redirectToLogin } from '../utils/nav';
import { ApiError } from '../types/common';

// 持久化登录态的形状（与 store/auth.store 共享）
interface PersistedAuth {
  token?: string;
  current_household_id?: string | number;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions<TData = unknown> {
  url: string;                                          // 形如 /api/v1/recipes 或 /chat/sessions/123
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data?: TData;
  query?: Record<string, QueryValue> | object;
  header?: Record<string, string>;
  loading?: boolean | string;                           // true/字符串 弹 wx.showLoading
  toastError?: boolean;                                 // 业务错误是否自动 toast，默认 true
  auth?: 'required' | 'optional' | 'none';              // 是否注入 token，默认 required
  timeout?: number;
}

// 用于流式请求的入参（http.ts 暴露底层 raw 方法供 sse.ts 复用 URL 拼接与 header 注入）
export interface RawRequestPrep {
  url: string;
  header: Record<string, string>;
}

// 全局并发 loading 计数（避免多请求叠加 showLoading 闪烁）
let _loadingCount = 0;
function showLoading(title: string) {
  _loadingCount += 1;
  if (_loadingCount === 1) {
    wx.showLoading({ title, mask: true });
  }
}
function hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) {
    wx.hideLoading();
  }
}

// 401 单次跳转锁
let _logoutFiring = false;

function buildHeader(opts: RequestOptions): Record<string, string> {
  const auth = opts.auth ?? 'required';
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(opts.header ?? {}),
  };
  if (auth !== 'none') {
    const persisted = getItem<PersistedAuth>(STORAGE_KEYS.AUTH);
    if (persisted?.token) {
      header['Authorization'] = `Bearer ${persisted.token}`;
    }
    if (persisted?.current_household_id) {
      header['X-Household-Id'] = String(persisted.current_household_id);
    }
  }
  return header;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = apiUrl(path);
  if (!query) return base;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query as Record<string, QueryValue>)) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  if (parts.length === 0) return base;
  return base + (base.includes('?') ? '&' : '?') + parts.join('&');
}

function handleAuthFailure(): void {
  if (_logoutFiring) return;
  _logoutFiring = true;
  removeItem(STORAGE_KEYS.AUTH);
  wx.showToast({ title: '登录已过期', icon: 'none' });
  setTimeout(() => {
    redirectToLogin();
    _logoutFiring = false;
  }, 300);
}

// 主请求方法
export function request<TResp = unknown, TData = unknown>(
  opts: RequestOptions<TData>,
): Promise<TResp> {
  const url = buildUrl(opts.url, opts.query);
  const header = buildHeader(opts);
  const method = opts.method ?? 'GET';
  const showSpin = !!opts.loading;
  const loadingTitle = typeof opts.loading === 'string' ? opts.loading : '加载中';
  const toastError = opts.toastError !== false;

  if (showSpin) showLoading(loadingTitle);

  return new Promise<TResp>((resolve, reject) => {
    wx.request({
      url,
      // wx 类型定义未声明 PATCH，但运行时实际支持；强转避免类型阻塞。
      method: method as WechatMiniprogram.RequestOption['method'],
      data: opts.data as WechatMiniprogram.IAnyObject,
      header,
      timeout: opts.timeout,
      success: (res) => {
        const status = res.statusCode;
        const body = res.data as TResp | ApiError | undefined;
        // 401 → 跳登录（即使 body 是 Kratos 错误信封，code=401 也会进 status===401）
        if (status === 401) {
          handleAuthFailure();
          reject({ code: 401, reason: 'UNAUTHORIZED', message: '登录已过期' } as ApiError);
          return;
        }
        if (status >= 200 && status < 300) {
          resolve(body as TResp);
          return;
        }
        // 业务错误
        const err = normalizeError(body, status);
        if (toastError && err.message) {
          wx.showToast({ title: err.message, icon: 'none' });
        }
        reject(err);
      },
      fail: (err) => {
        const e: ApiError = {
          code: -1,
          reason: 'NETWORK_ERROR',
          message: err.errMsg || '网络异常',
        };
        if (toastError) {
          wx.showToast({ title: e.message, icon: 'none' });
        }
        reject(e);
      },
      complete: () => {
        if (showSpin) hideLoading();
      },
    });
  });
}

// 暴露给 sse.ts 复用：仅做 URL 拼接和 header 注入，不发起请求
export function prepareRaw(path: string, extraHeader: Record<string, string> = {}): RawRequestPrep {
  return {
    url: apiUrl(path),
    header: {
      ...buildHeader({ url: path, auth: 'required' }),
      ...extraHeader,
    },
  };
}

// 直接读当前 token（供 sse 等少数需要明文 token 的场景使用）
export function getCurrentToken(): string | null {
  const a = getItem<PersistedAuth>(STORAGE_KEYS.AUTH);
  return a?.token ?? null;
}

// 写入登录态（auth store 调用）
export function persistAuth(auth: PersistedAuth): void {
  setItem(STORAGE_KEYS.AUTH, auth);
}

// 清除登录态
export function clearAuth(): void {
  removeItem(STORAGE_KEYS.AUTH);
}

function normalizeError(body: unknown, status: number): ApiError {
  if (body && typeof body === 'object') {
    const o = body as Partial<ApiError> & { msg?: string; error?: string };
    return {
      code: typeof o.code === 'number' ? o.code : status,
      reason: o.reason || o.error || `HTTP_${status}`,
      message: o.message || o.msg || `请求失败(${status})`,
      metadata: o.metadata,
    };
  }
  return {
    code: status,
    reason: `HTTP_${status}`,
    message: `请求失败(${status})`,
  };
}
