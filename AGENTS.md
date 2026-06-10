# Repository Guidelines

## 项目结构与模块组织

本仓库是 AICook 单体仓库，包含四个主要应用：`backend/` 是 Kratos v2 + Eino 的 Go 后端；`frontend/` 是 Vite + React + Tailwind 的 Web SPA；`inference-service/` 是 FastAPI 推理服务，负责语音识别和 OCR；`wx/` 是原生微信小程序。数据库迁移和种子数据位于 `deploy/sql/`，小程序项目入口由根目录 `project.config.json` 指向 `wx/miniprogram/`。测试跟随各语言约定放在源码旁，例如 Go 的 `*_test.go`。

## 构建、测试与本地开发命令

- `cd backend && go build ./cmd/backend/`：构建后端服务。
- `cd backend && go test ./...`：运行后端全部 Go 测试。
- `cd backend && buf generate`：根据 `backend/api/aicook/v1/` 重新生成 protobuf 代码。
- `cd frontend && pnpm dev`：启动 Web 开发服务；`pnpm build` 生成生产构建。
- `cd wx && pnpm build`：编译小程序 TypeScript 并构建 `miniprogram_npm`；克隆后必须执行。
- `cd wx && pnpm typecheck && pnpm lint`：运行小程序类型检查和 ESLint。
- `cd inference-service && uvicorn app.main:app --host 0.0.0.0 --port 8088`：启动推理服务。

## 编码风格与命名约定

统一使用 UTF-8。Go 代码保持 `gofmt` 风格，按 `service -> biz -> data -> platform` 分层，不做过度封装。前端使用 TypeScript、React 函数组件和现有 feature 目录；小程序遵循手写 BEM 风格组件，继续使用 gulp 编译链路，不提交生成的 `.js` 构建产物。新增用户可见文案、注释和文档使用简体中文。

## 架构与接口约束

后端 Handler 保持轻量，业务规则放在 `internal/biz/`，外部依赖适配放在 `internal/platform/`。所有 proto HTTP 响应使用 Kratos 错误信封和 snake_case 字段；`/chat/send` 是独立 SSE 端点，事件类型变更时必须同步 `wx/miniprogram/types/sse-events.d.ts`。新增仓储或服务构造函数后，记得在 `backend/cmd/backend` 重新执行 `wire`。

## 测试指南

后端新增逻辑优先补充局部 Go 单元测试，文件命名为 `xxx_test.go`。小程序变更至少运行 `pnpm typecheck`，涉及页面或服务层时运行 `pnpm lint`。Web 变更至少运行 `pnpm build`。涉及 protobuf、SSE 事件或 API 字段时，同步更新客户端类型和消费代码。

## 提交与 Pull Request 规范

提交信息使用中文，并带方括号前缀，例如 `[new] 新增三餐计划功能`、`[fix] 修复类型生成问题`、`[better] 优化页面加载`。PR 应说明变更范围、验证命令、关联 issue；涉及 UI 时附截图或录屏；涉及配置、迁移或 API 契约时明确兼容性影响。

## 配置与 API 契约提醒

后端本地配置使用 `AICOOK_CONFIG=./configs/config.yaml`。HTTP JSON 字段保持 `snake_case`，int64 雪花 ID 在客户端必须以字符串保存和传输。媒体上传遵循 Prepare -> presigned PUT -> Complete 流程，读取时由服务端重新签名 URL。
