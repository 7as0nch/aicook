// 媒体签名 URL 缓存。
//
// 背景：后端读取媒体时每次都重新预签名（SigV4），URL 的查询参数（X-Amz-Date/Signature 等）
// 每次响应都不同。微信 <image>/<video> 按「完整 URL」做本地缓存，URL 一变就 miss，
// 于是同一张封面/同一段视频每次进页面都要重新下载。
//
// 做法：以「对象路径」（去掉签名 query 的部分，等价于 OSS 对象 key）为缓存键，
// 记住上一次签名得到的完整 URL；在 TTL 内对同一资源始终返回同一个 URL，
// 让 <image>/<video> 的 src 跨页/重进保持字节一致 → 命中微信原生媒体缓存，不再重复下载。
//
// 安全：缓存 TTL（12h）短于后端预签名有效期（24h），复用的 URL 必然仍然有效。

const STORE_KEY = 'MEDIA_URL_CACHE_V1';
const TTL_MS = 12 * 60 * 60 * 1000; // 12h，< 后端 24h 预签名有效期
const MAX_ENTRIES = 400; // 上限，超出按最旧淘汰，避免 storage 膨胀

interface CacheEntry {
  url: string;
  ts: number;
}
type CacheMap = Record<string, CacheEntry>;

// 进程内副本：同一次运行多次命中走内存，避免频繁读 storage。
let mem: CacheMap | null = null;
let saveTimer: number | null = null;

function load(): CacheMap {
  if (mem) return mem;
  try {
    mem = (wx.getStorageSync(STORE_KEY) as CacheMap) || {};
  } catch {
    mem = {};
  }
  return mem;
}

// 合并同一帧内的多次写入，只落盘一次。
function scheduleSave(): void {
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      wx.setStorageSync(STORE_KEY, mem || {});
    } catch {
      // storage 写失败不致命：大不了下次重新签名
    }
  }, 0);
}

// 仅对本站预签名 URL 生效（含 SigV4 标志 X-Amz-）。
// 外链/微信默认头像等无签名 URL 本就稳定，原样返回、不进缓存。
function isSignedOSSURL(url: string): boolean {
  return url.indexOf('X-Amz-') >= 0;
}

// 取对象路径作为缓存键：scheme + host + path（去掉 query / fragment）。
function pathKey(url: string): string {
  let u = url;
  const h = u.indexOf('#');
  if (h >= 0) u = u.slice(0, h);
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  return u;
}

function prune(cache: CacheMap, now: number): void {
  for (const k of Object.keys(cache)) {
    if (now - cache[k].ts >= TTL_MS) delete cache[k];
  }
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => cache[a].ts - cache[b].ts); // 旧 → 新
    const drop = keys.length - MAX_ENTRIES;
    for (let i = 0; i < drop; i++) delete cache[keys[i]];
  }
}

// 把一条媒体 URL 归一为「跨调用稳定」的 URL：同一资源在 TTL 内复用同一个签名 URL。
export function stableMediaURL(url?: string): string {
  if (!url) return url || '';
  if (!isSignedOSSURL(url)) return url;
  const key = pathKey(url);
  const now = Date.now();
  const cache = load();
  const hit = cache[key];
  if (hit && now - hit.ts < TTL_MS) {
    return hit.url;
  }
  cache[key] = { url, ts: now };
  prune(cache, now);
  scheduleSave();
  return url;
}

// 批量版本：对数组逐项归一。
export function stableMediaURLs(urls?: string[]): string[] {
  if (!urls || !urls.length) return urls || [];
  return urls.map((u) => stableMediaURL(u));
}
