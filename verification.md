# Verification

- 日期：2026-04-08
- 执行者：Codex

## 已验证

- MiMo / Xiaomi provider 在开启 `web_search_enabled` 时，会通过 `backend/internal/platform/airuntime/chat.go` 注入原生 `tools=[{type:web_search,...}]` 请求参数。
- 在存在函数工具的场景下，`backend/internal/platform/airuntime/chat.go` 会把 function tools 与原生 `web_search` 合并到同一个 `tools` 数组，避免 `WithExtraFields` 覆盖默认工具列表。
- `backend/internal/platform/airuntime/runtime.go` 默认基础地址已统一为 `https://api.xiaomimimo.com/v1`。
- `backend/internal/platform/airuntime/routing_model.go` 已统一改为从运行时上下文读取调用选项，因此普通文本、多模态子链路、文本菜谱生成链路都能复用原生联网配置。
- `backend/internal/platform/airuntime/deep_tools.go` 在 MiMo + 开启联网时会隐藏 ADK `web_search` 工具，避免 deep planner 优先走 DuckDuckGo。
- `backend/internal/platform/airuntime/graph_runtime.go` 已改为模型原生联网优先；仅在非 MiMo 或 fallback 场景继续调用 DuckDuckGo。
- 图片输入链路仍保持模型优先：附件判断仍由 `routing_model.go` 和 `prompt.go` 走多模态 `image_url` 输入，未回退到 DuckDuckGo。
- `backend/internal/platform/airuntime/tool` 已按职责拆分为多文件，工具定义、审批状态机、结果结构与构造函数不再堆在单体 `tool.go` 中。
- `backend/internal/platform/airuntime/prompt.go` 会在“生成菜谱”意图下追加更强的链路提示，要求优先走推荐/生成链，而不是先给普通网页摘要。
- `backend/internal/platform/airuntime/reasoning.go` 现已兼容采集 MiMo `annotations` 与 `error_message`，并在 `adk_runtime.go` 中统一汇总到 `reply.Metadata.SearchResults/SearchError`。
- `/chat/send` 的 `done` 事件现在会返回 `search_results`，前端 `client.ts`、`AIAssistant.tsx`、`AIChatMessages.tsx` 会优先用这份列表渲染“执行过程”的搜索结果卡片。

## 本地命令

- AIRuntime 定向验证通过：
  - `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go test ./internal/platform/airuntime/... ./internal/server/...`
- 后端全量回归执行完成，但存在仓库既有失败：
  - `$env:GOCACHE='D:\workspace\goproject\my\aicook\.cache\go-build'; $env:GOMODCACHE='D:\workspace\goproject\my\aicook\.cache\gomod'; go test ./...`
  - 失败项：`github.com/chengjiang/aicook/backend/internal/auth/test.TestToken`
  - 失败位置：`backend/internal/auth/authRepo.go:48`
  - 失败现象：`index out of range [1] with length 1` panic

## 剩余风险

- 当前没有直接对外请求 MiMo 真接口做联调，所以还未实测供应商是否完整返回 annotations / citations 等字段。
- `user_location` 目前按需求示例固定为 `China / Hubei / Wuhan`；如果后续要按用户真实地区动态传入，建议补配置项或请求级参数。
- 仓库现有 `internal/auth/test.TestToken` 仍然失败，本轮没有改动该模块，但它会影响全量 `go test ./...` 的绿色状态。
- 当前环境缺少 `gofmt` 可执行文件，因此本轮未执行自动格式化。

## 2026-04-09 网页搜索 graph 收敛补充

- `backend/internal/platform/airuntime/graph/web_search.go` 已新增统一网页搜索 graph：未开启搜索时返回 `unsupported` 和统一提示；开启后执行搜索并返回结构化结果。
- `backend/internal/platform/airuntime/websearch.go` 已把 MiMo 原生联网收敛为 graph 内部执行器；普通模型回答不再自动注入原生联网工具，避免绕过 workflow/tool_call 可视化。
- `backend/internal/platform/airuntime/deep_tools.go` 中的 `web_search` 工具已改为触发统一 graph，并把 `search_results/search_error` 回写到 reply metadata。
- `backend/internal/platform/airuntime/graph_runtime.go` 中的文本菜谱 graph 已复用统一网页搜索 graph，因此搜索完成后会继续串回现有知识库、菜谱查询和生成流程，而不是停在单纯搜索摘要。
- `frontend/src/app/components/AIAssistant.tsx` 现在会在流式 `tool_call(web_search)` 到达时立刻同步 `searchResults/searchError`，不必等 `done` 才展示执行过程搜索列表。
- `frontend/src/app/components/ai-assistant/AIChatMessages.tsx` 会用 `searchResults` 渲染“联网搜索结果 N 条”、logo 横排、展开列表；正文和思考里的数字引用继续从 `sources` 解析并弹窗展示。
