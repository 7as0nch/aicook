package main

import (
	"os"

	"github.com/go-kratos/kratos/v2/log"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/logging"
)

const version = "0.1.0"

func main() {
	// 配置加载阶段先用标准输出兜底，避免 logger 依赖配置造成的先后问题。
	bootHelper := log.NewHelper(log.NewStdLogger(os.Stdout))

	cfgPath := os.Getenv("AICOOK_CONFIG")
	if cfgPath == "" {
		cfgPath = "../../configs/config.yaml"
	}

	cfg, err := conf.LoadBootstrap(cfgPath)
	if err != nil {
		bootHelper.Fatalf("加载配置失败: %v", err)
	}

	// 全局日志统一走 gocommon 的 zap 日志处理（控制台 + 文件，按天切割压缩）。
	logger := log.With(logging.NewLogger(cfg.GetLog()), "service", "aicook-backend", "version", version)
	helper := log.NewHelper(logger)

	app, cleanup, err := initApp(cfg, logger)
	if err != nil {
		helper.Fatalf("构建应用失败: %v", err)
	}
	defer cleanup()

	if err := app.Run(); err != nil {
		helper.Fatalf("运行应用失败: %v", err)
	}
}
