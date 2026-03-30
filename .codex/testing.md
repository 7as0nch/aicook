## 本地验证

- backend
  - 命令: `$env:GOCACHE='d:\workspace\goproject\my\aicook\.cache\go-build'; $env:GOMODCACHE='d:\workspace\goproject\my\aicook\.cache\gomod'; go test ./...`
  - 结果: 通过

- frontend
  - 命令: `pnpm.cmd --dir frontend build`
  - 结果: 通过

- wire
  - 命令: `$env:PATH = "D:\workspace\gopath\bin;" + $env:PATH; wire ./cmd/server`
  - 结果: 通过，生成 `backend/cmd/server/wire_gen.go`

## 环境限制

- `go mod tidy` 在默认模块缓存目录会遇到写锁权限问题，已改用仓库内 `.cache/gomod`
- 前端 `vite build` 在沙箱内会因为 `esbuild` 子进程 `spawn EPERM` 失败，放行后构建通过
- 当前环境没有 `docker`，未执行镜像构建
