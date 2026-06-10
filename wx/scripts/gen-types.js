/**
 * 从 backend proto 生成小程序 TS 类型（types/generated/）。
 *
 * 用法：pnpm gen:types （在 wx/ 目录下执行）
 * 前置：本机已安装 buf（backend 开发同款，https://buf.build）；ts-proto 已在 devDependencies。
 *
 * 选项与后端序列化行为对齐（backend/cmd/backend/main.go 设置了 UseProtoNames=true）：
 *   - snakeToCamel=false  → 字段名保持 snake_case，与响应 JSON 一致
 *   - forceLong=string    → int64 一律映射为 string（protojson 对 int64 输出字符串，防精度丢失）
 *   - useDate=string      → google.protobuf.Timestamp 映射为 RFC 3339 字符串
 *   - stringEnums=true    → 枚举输出名字字符串（protojson 默认行为）
 *   - onlyTypes=true      → 只生成类型，不生成编解码/客户端代码
 */
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const wxRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(wxRoot, '..', 'backend');
const outDir = path.resolve(wxRoot, 'miniprogram', 'types', 'generated');

// pnpm 在 Windows 下生成 .CMD shim，其他平台是可执行脚本
const pluginName = process.platform === 'win32' ? 'protoc-gen-ts_proto.CMD' : 'protoc-gen-ts_proto';
const pluginPath = path.join(wxRoot, 'node_modules', '.bin', pluginName);

if (!fs.existsSync(pluginPath)) {
  console.error('[gen-types] 找不到 ts-proto 插件，请先在 wx/ 下执行 pnpm install');
  process.exit(1);
}

const template = {
  version: 'v1',
  plugins: [
    {
      plugin: 'ts_proto',
      path: pluginPath,
      out: outDir,
      opt: [
        'onlyTypes=true',
        'snakeToCamel=false',
        'forceLong=string',
        'stringEnums=true',
        'useDate=string',
        'useOptionals=all',
        'esModuleInterop=true',
      ],
    },
  ],
};

// 模板写入临时文件再传给 buf（Windows shell 会破坏内联 JSON 的引号）
const templateFile = path.join(os.tmpdir(), `aicook-buf-gen-ts-${process.pid}.json`);
fs.writeFileSync(templateFile, JSON.stringify(template));

try {
  execFileSync(
    'buf',
    ['generate', '--template', templateFile, '--path', 'api/aicook/v1'],
    { cwd: backendRoot, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  console.log(`[gen-types] 生成完成 → ${path.relative(wxRoot, outDir)}`);
} catch (e) {
  console.error('[gen-types] buf generate 失败（确认已安装 buf 且在 PATH 中）');
  process.exit(1);
} finally {
  try { fs.unlinkSync(templateFile); } catch (_) { /* 忽略清理失败 */ }
}
