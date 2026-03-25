package main

import (
	"os"

	"github.com/go-kratos/kratos/v2/log"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

const version = "0.1.0"

func main() {
	logger := log.NewStdLogger(os.Stdout)
	helper := log.NewHelper(log.With(logger, "service", "aicook-backend", "version", version))

	cfgPath := os.Getenv("AICOOK_CONFIG")
	if cfgPath == "" {
		cfgPath = "../../configs/config.yaml"
	}

	cfg, err := conf.LoadBootstrap(cfgPath)
	if err != nil {
		helper.Fatalf("加载配置失败: %v", err)
	}

	app, cleanup, err := initApp(cfg, logger)
	if err != nil {
		helper.Fatalf("构建应用失败: %v", err)
	}
	defer cleanup()

	if err := app.Run(); err != nil {
		helper.Fatalf("运行应用失败: %v", err)
	}
}
