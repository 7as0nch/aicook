// 环境配置：根据 __wxConfig.envVersion 切换不同的后端地址
// develop = 微信开发者工具本地; trial = 体验版; release = 正式版

interface EnvConfig {
  apiBase: string;      // 业务 API 前缀（含 /api/v1）
  rawHost: string;      // 不带 /api/v1 的根域名（chat、health 等）
  envVersion: 'develop' | 'trial' | 'release';
}

let current: EnvConfig = {
  apiBase: 'https://dev.aicook.example.com',
  rawHost: 'https://dev.aicook.example.com',
  envVersion: 'develop',
};

export function initEnv(): void {
  // 微信小程序运行时通过 __wxConfig.envVersion 取环境
  // 注意：开发者工具中始终为 develop，线上由 wx 平台决定
  let env: 'develop' | 'trial' | 'release' = 'develop';
  try {
    const accountInfo = wx.getAccountInfoSync?.();
    if (accountInfo?.miniProgram?.envVersion) {
      env = accountInfo.miniProgram.envVersion;
    }
  } catch (_) {
    // ignore - 老版本基础库 fallback 到 develop
  }

  switch (env) {
    case 'release':
      current = {
        apiBase: 'https://api.aicook.example.com',
        rawHost: 'https://api.aicook.example.com',
        envVersion: 'release',
      };
      break;
    case 'trial':
      current = {
        apiBase: 'https://test.aicook.example.com',
        rawHost: 'https://test.aicook.example.com',
        envVersion: 'trial',
      };
      break;
    case 'develop':
    default:
      current = {
        apiBase: 'https://dev.aicook.example.com',
        rawHost: 'https://dev.aicook.example.com',
        envVersion: 'develop',
      };
      break;
  }
  console.info('[env] init', current);
}

export function getEnv(): EnvConfig {
  return current;
}

export function apiUrl(path: string): string {
  // path 形如 /api/v1/recipes 或 /chat/send，直接拼到 rawHost
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return current.rawHost + path;
}
