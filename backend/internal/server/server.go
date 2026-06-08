package server

import (
	"github.com/go-kratos/kratos/v2"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/go-kratos/kratos/v2/transport/http"
	"github.com/google/wire"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

var ProviderSet = wire.NewSet(
	NewAIChatHandler,
	NewWxLoginHandler,
	NewHTTPServer,
	NewGRPCServer,
	NewApp,
)

func NewApp(cfg *conf.Bootstrap, logger log.Logger, httpServer *http.Server, grpcServer *grpc.Server) *kratos.App {
	return kratos.New(
		kratos.Name(cfg.GetServer().GetName()),
		kratos.Logger(logger),
		kratos.Server(httpServer, grpcServer),
	)
}
