## 本地验证

- airuntime 定向验证
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\.cache\go-build'; $env:GOMODCACHE='D:\workspace\goproject\my\aicook\.cache\gomod'; go test ./internal/platform/airuntime/...`
  - 结果: 通过

- backend 全量测试
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\.cache\go-build'; $env:GOMODCACHE='D:\workspace\goproject\my\aicook\.cache\gomod'; go test ./...`
  - 结果: 未全绿。除 `internal/auth/test.TestToken` 外，其余包均完成编译/测试；失败原因为仓库既有用例在 `backend/internal/auth/authRepo.go:48` 触发 `index out of range [1] with length 1` panic，与本轮 MiMo 联网改造无直接关联。

## 环境限制

- 当前 Go 安装未直接提供 `gofmt` 可执行文件，本轮未额外运行格式化命令；改动保持现有风格并通过 Go 编译验证。
- 首次执行 `go test` 需要放行网络下载缺失依赖，之后已完成定向验证和全量回归验证。
- 当前环境未对接真实 MiMo API 做在线联调，因此原生联网能力以请求参数注入和本地编译通过为主。

## 2026-04-08 本轮补充验证

- MiMo tools 合并与工具目录重构
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go test ./internal/platform/airuntime/... ./internal/server/...`
  - 结果: 通过

- go fmt 尝试
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go fmt ./internal/platform/airuntime/... ./internal/server/...`
  - 结果: 未执行成功，环境缺少 `gofmt` 可执行文件

- 菜谱生成链路与 MiMo 搜索结果回传修复
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go test ./internal/platform/airuntime/... ./internal/server/...`
  - 结果: 通过
  - 覆盖点: `search_results/search_error` 元数据、MiMo annotations 采集、MiMo 场景隐藏 root `web_search` fallback、菜谱生成意图提示增强
- MiMo 原生联网流式工具事件
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go test ./internal/platform/airuntime/... ./internal/server/...`
  - 结果: 通过
  - 覆盖点: 流式 `web_search` 伪工具事件、workflow 收口、annotations 到 `search_results` 的实时桥接
- 网页搜索 graph 收敛改造
  - 命令: `$env:GOCACHE=''D:\workspace\goproject\my\aicook\backend\.gocache''; go test ./internal/platform/airuntime/... ./internal/server/...`
  - 结果: 通过
  - 覆盖点: `web_search graph`、MiMo 原生联网执行器、禁止普通模型自动原生联网、搜索结果串回后续流程

- 前端静态检查
  - 命令: `pnpm exec tsc --noEmit`
  - 结果: 未通过
  - 说明: 失败项来自仓库既有依赖/页面问题，如 `Home.tsx` 数据导出、`react-router-dom` / `framer-motion` 缺失，与本轮网页搜索链路改动无直接对应错误- 网页搜索 graph 收敛与后端定向验证
  - 命令: `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go test ./internal/platform/airuntime/... ./internal/server/...`
  - 结果: 通过
  - 覆盖点: `web_search graph`、未开启搜索统一提示、MiMo 原生联网执行器、搜索结果串回知识库/菜谱流程、前端实时消费 `tool_call(web_search)`
