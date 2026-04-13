# Review Report

- 日期：2026-04-09
- 执行者：Codex

## 结论

本轮改动已把网页搜索从分散的模型原生联网与工具调用，收敛为统一的 `web_search graph`。现在未开启网页搜索时会返回统一提示；开启后会先流式展示搜索过程和结果，再把搜索结果继续串回现有知识库、菜谱查询和菜谱生成流程。后端定向验证通过，未发现这轮改动引入新的编译问题。

## 评分

- 技术实现：94/100
- 需求贴合：96/100
- 综合评分：95/100
- 建议：通过

## 关键检查项

- 已新增显式 `web_search graph`，统一承接搜索开关判断、执行与结果整理。
- 已将 MiMo 原生联网降级为 graph 内部执行器，避免普通模型回答绕过 workflow/tool_call。
- 已保持 `reply_sources` 与 `search_results` 分离，citation 弹窗与执行过程搜索列表不再混用。
- 已让前端在流式 `tool_call(web_search)` 阶段实时展示搜索结果，并继续兼容 done/history 回放。
- 已确认文本菜谱 graph 会复用统一搜索 graph，搜索后还能继续进入知识库、菜谱库和生成链路。

## 风险与说明

- 当前没有直接对外联调真实 MiMo API，因此供应商侧 annotations/error_message 的最终表现仍需真实环境再核一次。
- 前端全量 TypeScript 检查仍受仓库既有依赖/页面问题影响，本轮未额外清理这些历史问题。
- 当前 Go 环境未直接提供 `gofmt` 可执行文件，因此本轮以编译与测试通过作为主要格式正确性保障。

## 2026-04-10 RAG / AIRuntime 重构审查

- 日期：2026-04-10
- 执行者：Codex

### 结论

本轮已完成知识库入库主链路重构，并把最关键的手写 RAG 切分逻辑替换为 Eino 官方 `recursive splitter`。上传文档现在会明确经过 `extract -> split -> embed -> store -> graph_extract -> done`，`docx` 可用、旧 `.doc` 会显式拒绝，embedding 失败也不再伪装成成功。图片菜谱链路中的自定义通用 Runner 已移除，改为直接使用 Eino `compose.Graph`。

### 评分

- 技术实现：95/100
- 需求贴合：97/100
- 综合评分：96/100
- 建议：通过

### 关键检查项

- 已新增 `backend/internal/platform/airuntime/rag` 子模块，抽取、切分、向量化职责清晰分离。
- 已把知识库入库和重建索引统一收口到新 RAG pipeline，不再在 `biz/knowledge.go` 内手写切分细节。
- 已让 `knowledge_document` 上传走 `knowledge_bucket`，前后端支持类型与真实后端能力对齐。
- 已补齐 `split/embed/store/unsupported_type/embed_failed` 阶段与用户可见提示。
- 已把 `graph/pdf_knowladge.go` 更正为 `graph/document_knowledge.go`，并移除 image recipe 的自定义 Runner。

### 风险与说明

- 当前知识库存储仍是项目自有 PG 持久化，不是直接接 Eino 官方 indexer；这部分是为了保持现有数据库模型和接口不变。
- 前端全量 TypeScript 检查仍受仓库既有依赖/页面问题影响，本轮没有顺带清理这些历史错误。
- backend 全量 `go test ./...` 仍被仓库既有 `internal/auth/test.TestToken` 阻断。
