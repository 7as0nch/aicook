## 2026-03-24 16:10 CST
- Tool: shell_command
- Purpose: 扫描仓库现状与已有实现
- Params: `git status --short`, `rg --files backend frontend`
- Result: 确认 backend 尚未完成 Kratos 标准布局，frontend 仍使用 multipart 上传
- Decision: 先补 backend Kratos/protobuf 主链路，再切前端上传协议

## 2026-03-24 16:30 CST
- Tool: shell_command
- Purpose: 安装 protobuf / wire 相关工具
- Params: `go install ...`, `buf generate`
- Result: 已生成 api 与 conf 的 pb/grpc/http 代码
- Decision: 在生成代码基础上补齐新的 biz/service/server/cmd 目录

## 2026-03-24 17:05 CST
- Tool: apply_patch
- Purpose: 实现新的 backend Kratos 主链路
- Params: `backend/internal/biz/*`, `backend/internal/service/*`, `backend/internal/server/*`, `backend/cmd/server/*`
- Result: 六组 usecase、六组 protobuf service、HTTP/gRPC server、Wire 入口均已补齐
- Decision: 保留旧 `internal/app` 和 `cmd/backend`，仅做兼容性修补

## 2026-03-24 17:20 CST
- Tool: apply_patch
- Purpose: 重写 AIRuntime 并修正旧编码问题
- Params: `backend/internal/platform/airuntime/runtime.go`
- Result: 统一了 ADK/Graph 提示词、fallback 回复与图片菜谱草稿启发式逻辑
- Decision: 先保证编译与链路正确，不在本轮扩展更多 AI 规则

## 2026-03-24 17:35 CST
- Tool: shell_command
- Purpose: 生成 Wire 并验证后端
- Params: `wire ./cmd/server`, `go test ./...`
- Result: 发现 gRPC 依赖版本过旧，升级到 `google.golang.org/grpc v1.68.1` 后测试通过
- Decision: 使用仓库内 `.cache/gomod` 作为 GOMODCACHE，规避默认模块缓存写锁问题

## 2026-03-24 17:50 CST
- Tool: apply_patch
- Purpose: 切换前端到两段式上传，并对齐 protobuf 响应结构
- Params: `frontend/src/api/client.ts`, `frontend/src/components/QuoteDrawer.vue`
- Result: 图片、语音、知识库文档上传全部改走 prepare + PUT + complete
- Decision: 继续保持页面层调用方式尽量不变，优先减少联动修改

## 2026-03-24 18:00 CST
- Tool: apply_patch
- Purpose: 修正发布入口
- Params: `backend/Dockerfile`
- Result: backend 镜像已改为构建 `cmd/server`，并暴露 HTTP/GRPC 端口
- Decision: 前端继续沿用“先本地 build dist，再 Docker build/push”的现有发布脚本

## 2026-04-08 15:10 CST
- Tool: shell_command
- Purpose: 扫描本次 AI 联网改造相关实现
- Params: `rg -n "duckduckgo|web_search|chat/completions|image_url|mimo" .`，`Get-Content backend/internal/platform/airuntime/{chat.go,routing_model.go,deep_tools.go,graph_runtime.go,websearch.go,text_recipe_prompt.go}`
- Result: 确认 Xiaomi/MiMo provider 已接入，但联网搜索仍默认走 DuckDuckGo 工具；图像输入已走多模态模型
- Decision: 在 ChatModel 调用参数层注入 MiMo 原生 web_search，并在 ADK/graph 层降低 DuckDuckGo 为 fallback

## 2026-04-08 15:25 CST
- Tool: apply_patch
- Purpose: 实现 MiMo 原生联网优先与 DuckDuckGo 兜底
- Params: `backend/internal/platform/airuntime/chat.go`、`backend/internal/platform/airuntime/routing_model.go`、`backend/internal/platform/airuntime/deep_tools.go`、`backend/internal/platform/airuntime/websearch.go`、`backend/internal/platform/airuntime/graph_runtime.go`、`backend/internal/platform/airuntime/text_recipe_prompt.go`、`backend/internal/platform/airuntime/tool/tool.go`
- Result: 已为 MiMo 场景注入 `tools=[{type:web_search,...}]` 扩展字段，并在 MiMo + 开启联网时隐藏 ADK `web_search` 工具；文本菜谱 graph 改为模型原生联网优先
- Decision: 继续执行 go 测试；若沙箱阻止模块下载，则申请放行完成验证

## 2026-04-08 19:35 CST
- Tool: shell_command
- Purpose: 对照 MiMo OpenAI 兼容文档与 eino-ext/openai 实现，确认 tools 合并策略
- Params: `Get-Content backend/internal/platform/airuntime/{runtime.go,chat.go,reasoning.go,prompt.go}`，`rg -n "ExtraFields|tools" $GOPATH/pkg/mod/github.com/cloudwego/eino-ext`
- Result: 确认 `WithExtraFields` 会覆盖同名 `tools` 字段，因此不能仅追加原生 web_search，必须把 function tools 与 web_search 合并成同一个数组
- Decision: 在 `chat.go` 中自行构造 MiMo tools 负载，并保留 ADK 绑定工具能力

## 2026-04-08 19:50 CST
- Tool: apply_patch
- Purpose: 修正 MiMo 地址并重构工具目录
- Params: `backend/internal/platform/airuntime/{chat.go,routing_model.go,runtime.go}`、`backend/internal/platform/airuntime/tool/*.go`
- Result: 默认 MiMo 基础地址已统一到 `https://api.xiaomimimo.com/v1`；新增 `tool/models.go`、`tool/search_tools.go`、`tool/memory_tool.go`、`tool/image_tool.go`、`tool/recommend_tool.go`、`tool/recipe_generate_tool.go`，删除单体 `tool/tool.go`
- Decision: 保留 `deep_tools.go` 作为 Runtime 绑定薄层，工具结构与状态机全部迁移到 `tool` 目录维护

## 2026-04-08 20:05 CST
- Tool: shell_command
- Purpose: 本地编译验证与格式化尝试
- Params: `$env:GOCACHE='D:\workspace\goproject\my\aicook\backend\.gocache'; go test ./internal/platform/airuntime/... ./internal/server/...`，`go fmt ./internal/platform/airuntime/... ./internal/server/...`
- Result: 定向 `go test` 通过；`go fmt` 因当前环境缺少 `gofmt` 可执行文件未能执行
- Decision: 以编译与定向测试通过作为本轮验收依据，并在 testing/verification 中记录格式化环境限制

## 2026-04-08 20:35 CST
- Tool: apply_patch
- Purpose: 修正“联网后菜谱生成跑偏”为搜索摘要，并补齐 MiMo 原生搜索结果回传链路
- Params: `backend/internal/platform/airuntime/{types.go,intent.go,prompt.go,deep_tools.go,reasoning.go,adk_runtime.go}`、`backend/internal/server/chat_http.go`、`frontend/src/{lib/api/client.ts,app/components/AIAssistant.tsx,app/components/ai-assistant/{AIChatMessages.tsx,types.ts}}`
- Result: 为 reply metadata 新增 `search_results/search_error`；MiMo `annotations/error_message` 可累计到上下文并在流式结束统一回传；MiMo 场景下 deep root 不再暴露 DuckDuckGo `web_search` 工具，菜谱生成意图会被更强地导向推荐/生成链；前端执行过程改为优先展示 `search_results`
- Decision: 使用后端定向 `go test` 作为本轮验收，并保留前端真机联调作为下一步人工回归项
## 2026-04-08 21:05 CST
- Tool: apply_patch
- Purpose: 为 MiMo 原生联网补齐流式 `web_search` 伪工具事件
- Params: `backend/internal/platform/airuntime/{reasoning.go,adk_runtime.go}`
- Result: 当流式 chunk 首次出现 `annotations/url_citation` 时，后端会立刻发出 `tool_call(name=web_search,status=running)` 与对应 workflow；结束时再收口为 success/error，前端可实时展示搜索过程
- Decision: 保持 `reply_sources` 负责 citation，`search_results` 负责执行过程，避免两者混用
## 2026-04-09 10:35 CST
- Tool: apply_patch
- Purpose: 将网页搜索收敛为统一 graph，并取消普通模型调用中的自动原生联网注入
- Params: `backend/internal/platform/airuntime/{chat.go,websearch.go,deep_tools.go,graph_runtime.go,adk_runtime.go}`、`backend/internal/platform/airuntime/graph/{web_search.go,localize.go}`、`backend/internal/platform/airuntime/tool/search_tools.go`、`frontend/src/app/components/{AIAssistant.tsx,ai-assistant/AIChatMessages.tsx}`
- Result: 新增 `web_search graph`，未开启时返回统一不可用提示；开启后先走搜索 graph，再把结果串回现有知识库/菜谱流程；MiMo 原生联网降级为 graph 内部执行器，不再绕过 workflow 直接回答
- Decision: 保留 `reply_sources` 给 citation，`search_results` 给执行过程；前端折叠/展开搜索结果都以 graph/tool 输出为准## 2026-04-09 11:20 CST
- Tool: shell_command / apply_patch / go test
- Purpose: 将网页搜索统一收敛为 workflow graph，并把执行结果重新串回知识库、菜谱查询与菜谱生成流程
- Params: ackend/internal/platform/airuntime/{adk_runtime.go,chat.go,deep_tools.go,graph_runtime.go,websearch.go}、ackend/internal/platform/airuntime/graph/{web_search.go,localize.go}、ackend/internal/platform/airuntime/tool/search_tools.go、rontend/src/app/components/{AIAssistant.tsx,ai-assistant/AIChatMessages.tsx}
- Result: 普通模型调用不再自动挂原生联网；deep planner 通过 web_search 工具统一触发 graph；未开启搜索时返回统一提示；开启后先展示搜索 workflow/tool_call，再将结果串回现有知识库、菜谱库和生成链路
- Decision: 保留 MiMo 原生联网作为 graph 内部执行器，eply_sources 与 search_results 继续拆分，避免 citation 与流程搜索列表混淆
