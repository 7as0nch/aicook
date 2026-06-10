// 环境配置：根据小程序运行环境（develop/trial/release）切换后端地址。
// - 三套环境的地址集中在 ENV_PRESETS 一处维护；上线时把 release/trial 的占位域名换成真实域名即可。
// - 开发机地址可通过 utils/env.local.ts 覆盖（该文件不入库，模板见 env.local.example.ts），
//   避免不同开发者互相改动仓库里的 IP。

export type EnvVersion = 'develop' | 'trial' | 'release';

export interface EnvConfig {
  host: string;          // 后端根地址（不含路径）；/api/v1/* 与 /chat/send 都直接拼在其后
  envVersion: EnvVersion;
}

// 本地覆盖文件的形状（仅开发环境生效）
interface EnvLocalOverride {
  developHost?: string;
}

const DEFAULT_DEVELOP_HOST = 'http://127.0.0.1:8000';

// 三套环境预设。release/trial 当前为占位域名（尚未部署公网），换真实域名只改这里。
const ENV_PRESETS: Record<EnvVersion, EnvConfig> = {
  develop: { host: DEFAULT_DEVELOP_HOST, envVersion: 'develop' },
  trial: { host: 'https://test.aicook.example.com', envVersion: 'trial' },
  release: { host: 'https://api.aicook.example.com', envVersion: 'release' },
};

// 微信运行时的 CommonJS require（用于可选加载 env.local，缺失时静默忽略）
declare function require(path: string): unknown;

function loadLocalOverride(): EnvLocalOverride {
  try {
    const mod = require('./env.local') as { developHost?: string; default?: EnvLocalOverride } | undefined;
    if (mod && typeof mod === 'object') {
      return (mod.default && typeof mod.default === 'object' ? mod.default : mod) as EnvLocalOverride;
    }
  } catch (_) {
    // env.local.ts 不存在：正常情况，使用默认开发地址
  }
  return {};
}

let current: EnvConfig = ENV_PRESETS.develop;

export function initEnv(): void {
  // 微信小程序通过 accountInfo.miniProgram.envVersion 取环境：
  // 开发者工具中始终为 develop，体验版 trial，正式版 release
  let env: EnvVersion = 'develop';
  try {
    const accountInfo = wx.getAccountInfoSync?.();
    if (accountInfo?.miniProgram?.envVersion) {
      env = accountInfo.miniProgram.envVersion;
    }
  } catch (_) {
    // 老版本基础库 fallback 到 develop
  }

  current = { ...ENV_PRESETS[env] };
  if (env === 'develop') {
    const local = loadLocalOverride();
    if (local.developHost) {
      current.host = local.developHost;
    }
  }
  console.info('[env] init', current);
}

export function getEnv(): EnvConfig {
  return current;
}

export function apiUrl(path: string): string {
  // path 形如 /api/v1/recipes 或 /chat/send，直接拼到 host
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return current.host + path;
}
