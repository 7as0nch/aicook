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
