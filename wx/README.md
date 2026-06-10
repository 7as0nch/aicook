# AIcook 微信小程序

馋猫厨房 — 家庭智能厨房助手的微信小程序端，复用同仓库 `backend/` 后端 API。

## 技术栈

- **原生小程序** + **TypeScript 5**（不使用 Taro / uni-app）
- **TDesign MiniProgram**（UI 组件库）
- **mobx-miniprogram** + **mobx-miniprogram-bindings**（状态管理）
- **Gulp**（TS → JS 编译）
- **ESLint** + **@typescript-eslint**（代码风格）

## 目录结构

```
wx/
├── miniprogram/         # 小程序根（project.config.json miniprogramRoot 指向此处）
│   ├── app.ts/json/wxss
│   ├── pages/           # 14 个页面（5 Tab + 登录注册 + 7 子页）
│   ├── components/      # 业务/通用组件（阶段 1+ 实现）
│   ├── services/        # 后端接口封装：http / sse / upload + 10 个 *.api.ts
│   ├── store/           # mobx 全局状态：auth/household/cooking/chat/plan/inventory
│   ├── utils/           # 通用工具：env/storage/time/format/nav/id/eventbus
│   ├── styles/          # 主题变量 theme.wxss
│   ├── types/           # api.d.ts / chat.d.ts / common.d.ts
│   └── assets/          # 图片资源（tabbar 图标 / 馋猫 IP / 通用图标）
├── typings/             # 微信运行时类型补充
├── package.json
├── tsconfig.json
├── gulpfile.js
└── .eslintrc.js
```

## 开发流程

### 首次准备

```bash
cd wx
pnpm install
pnpm build         # 编译 TS → JS（在 miniprogram/ 同目录生成 .js）+ 构建 miniprogram_npm
```

> **重要**：`.js` 是 gulp 编译产物、不入库（.gitignore 已忽略）。clone 后必须先执行
> `pnpm install && pnpm build`，否则开发者工具里小程序无法运行。

### 本地后端地址覆盖

开发环境默认指向 `http://127.0.0.1:8000`。如后端跑在其他机器，复制
`miniprogram/utils/env.local.example.ts` 为 `env.local.ts`（不入库），改 `developHost` 即可。
正式/体验环境域名集中在 `miniprogram/utils/env.ts` 的 `ENV_PRESETS` 中维护（当前为占位域名）。

### 类型生成（proto → TS）

```bash
pnpm gen:types     # 从 backend proto 生成 miniprogram/types/generated/（需本机安装 buf）
```

后端 proto 变更后重跑此命令并提交产物。生成选项与后端 protojson 行为对齐
（snake_case 字段、int64→string、Timestamp→RFC3339 字符串），详见 `scripts/gen-types.js`。
历史手写类型 `types/api.d.ts` 正在逐步迁往 generated，新代码请直接用 generated 类型。

### 在微信开发者工具中

1. 打开 `D:\workspace\goproject\my\aicook\` 仓库根目录（**不是 wx/**）
2. 工具会读取根目录的 [project.config.json](../project.config.json)，其 `miniprogramRoot` 已指向 `wx/miniprogram/`
3. AppID：`wx25c43818e829e7be`
4. 调试时建议开启「不校验合法域名 / 业务域名」（开发环境后端通常是 http）

### 日常开发

```bash
# 一个终端开 watch（自动 ts → js）
npm run watch

# 另一个终端按需做类型检查与 lint
npm run typecheck
npm run lint
```

## 阶段路线（与 plan 文件对齐）

- **阶段 0**（已完成）脚手架：项目骨架、API 封装、SSE 雏形、5 Tab 空壳
- **阶段 1** 鉴权：登录 / 注册 / 自动续登 / 家庭切换
- **阶段 2** 首页：今日推荐、馋猫吉祥物、最近做过
- **阶段 3** 菜谱浏览：列表 / 分类 / 详情 / 食材勾选
- **阶段 4** 做菜步骤 + 烹饪历史：计时器、跨设备同步、完成入历史
- **阶段 5** 周计划 + 购物清单
- **阶段 6** AI 厨艺助理（SSE 流式核心）

后续迭代：库存 / 媒体上传 / 图片识别 / 语音输入 / 分享 / 知识库 / 微信一键登录。

## 接口约定

- 业务 API：`POST/GET/PUT/PATCH/DELETE /api/v1/...`
- AI 流式：`POST /chat/send`（SSE，参考 `services/sse.ts`）
- 鉴权：`Authorization: Bearer <token>`，白名单仅 `Register` / `Login`
- 业务错误格式（Kratos）：`{ code, reason, message }`，已在 `services/http.ts` 统一解析

## 多环境

`utils/env.ts` 通过 `wx.getAccountInfoSync().miniProgram.envVersion` 切换：
- `develop` → 开发者工具内
- `trial` → 体验版
- `release` → 正式版

需在小程序后台**配置三类合法域名**（每个环境独立）：
- `request` → 后端 API 域名
- `uploadFile` / 也走 request → OSS 直传域名
- `socket` → 预留 WebSocket（如 SSE 降级方案）

## SSE 流式聊天注意事项

`services/sse.ts` 使用 `wx.request({ enableChunked: true })` + `onChunkReceived` 接收 `/chat/send` 流。需要：
- 微信基础库 ≥ 2.20（项目已配置 3.15.2）
- iOS 真机首次需信任证书（开发模式下确认）
- 中断由调用方持有 `task.abort()` 调用

如真机出现 chunk 不及时，可考虑后端加 WebSocket 适配（`services/sse.ts` 预留切换点）。

## 提交规范

提交至仓库时：
- `wx/miniprogram/**/*.js` 已在 `.gitignore` 中（编译产物）
- `wx/node_modules/` 已忽略
- TDesign 与 mobx 通过 `pnpm build` 后的 `miniprogram_npm/` 也已忽略
- `miniprogram/utils/env.local.ts` 已忽略（本地后端地址覆盖）

## 构建链决策记录

- **保持 gulp 编译 TS**，不启用开发者工具的 `useCompilerPlugins`：现有 gulp + build-npm 流水线
  稳定且被 CI（miniprogram-ci）依赖，迁移收益低、行为差异风险高。
- **暗色模式暂不做**：需要全量 wxss 颜色变量化 + theme.json + TDesign 主题适配，工作量约等于
  一轮完整 UI 重构，待产品明确需求后再立项。
