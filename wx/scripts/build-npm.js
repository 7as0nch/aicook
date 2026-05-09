/**
 * 程序化构建小程序 npm 包，等价于微信开发者工具中的「工具 → 构建 npm」。
 * 读取 wx/package.json 的 dependencies，把每个包按小程序约定（miniprogram 字段或 main 入口）
 * 转换并复制到 wx/miniprogram/miniprogram_npm/<pkg>/。
 */
const path = require('path');
const ci = require('miniprogram-ci');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const result = await ci.packNpmManually({
    packageJsonPath: path.join(projectRoot, 'package.json'),
    miniprogramNpmDistDir: path.join(projectRoot, 'miniprogram'),
    ignores: [],
  });
  console.log('[build-npm] done', result);
}

main().catch((err) => {
  console.error('[build-npm] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
