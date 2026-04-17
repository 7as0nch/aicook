package server

import (
	"context"
	nethttp "net/http"
	"time"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/auth"
	kratoshttp "github.com/go-kratos/kratos/v2/transport/http"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware/logging"
	"github.com/go-kratos/kratos/v2/middleware/recovery"
	"github.com/go-kratos/kratos/v2/middleware/selector"
	"github.com/golang-jwt/jwt/v4"

	"github.com/chengjiang/aicook/backend/internal/conf"
	svc "github.com/chengjiang/aicook/backend/internal/service"
)

type Registrar interface {
	Register(mux *nethttp.ServeMux)
}

func NewLegacyHTTPServer(cfg *conf.Bootstrap, registrars ...Registrar) *kratoshttp.Server {
	timeout := cfg.GetServer().GetHttp().GetTimeout().AsDuration()
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	server := kratoshttp.NewServer(
		kratoshttp.Address(cfg.GetServer().GetHttp().GetAddr()),
		kratoshttp.Timeout(timeout),
	)

	mux := nethttp.NewServeMux()
	mux.HandleFunc("GET /health", func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.WriteHeader(nethttp.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	for _, registrar := range registrars {
		registrar.Register(mux)
	}

	server.HandlePrefix("/", mux)
	return server
}

func NewHTTPServer(cfg *conf.Bootstrap, logger log.Logger, authRepo auth.AuthRepo, authSvc *svc.AuthService, householdSvc *svc.HouseholdService, recipeSvc *svc.RecipeService, mediaSvc *svc.MediaService, voiceSvc *svc.VoiceService, importSvc *svc.ImportService, knowledgeSvc *svc.KnowledgeService, aiSvc *svc.AIService, cookingSvc *svc.CookingService, kitchenSvc *svc.KitchenService, chatHandler *AIChatHandler) *kratoshttp.Server {
	timeout := cfg.GetServer().GetHttp().GetTimeout().AsDuration()
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	publicOperations := map[string]bool{
		"/aicook.v1.AuthService/Register": true,
		"/aicook.v1.AuthService/Login":    true,
	}

	options := []kratoshttp.ServerOption{
		kratoshttp.Address(cfg.GetServer().GetHttp().GetAddr()),
		kratoshttp.Timeout(timeout),
		kratoshttp.Middleware(
			recovery.Recovery(),
			logging.Server(logger),
			selector.Server(
				auth.Server(authRepo.KeyFunc(), auth.WithClaims(func() jwt.Claims { return &auth.JwtClaims{} })),
			).Match(func(ctx context.Context, operation string) bool {
				return auth.NewWhiteListMatcher(publicOperations)(ctx, operation)
			}).Build(),
		),
	}
	if network := cfg.GetServer().GetHttp().GetNetwork(); network != "" {
		options = append(options, kratoshttp.Network(network))
	}

	server := kratoshttp.NewServer(options...)
	v1.RegisterAuthServiceHTTPServer(server, authSvc)
	v1.RegisterHouseholdServiceHTTPServer(server, householdSvc)
	v1.RegisterRecipeServiceHTTPServer(server, recipeSvc)
	v1.RegisterMediaServiceHTTPServer(server, mediaSvc)
	v1.RegisterVoiceServiceHTTPServer(server, voiceSvc)
	v1.RegisterImportServiceHTTPServer(server, importSvc)
	v1.RegisterKnowledgeServiceHTTPServer(server, knowledgeSvc)
	v1.RegisterAIServiceHTTPServer(server, aiSvc)
	v1.RegisterCookingServiceHTTPServer(server, cookingSvc)
	if kitchenSvc != nil {
		v1.RegisterKitchenServiceHTTPServer(server, kitchenSvc)
	}

	mux := nethttp.NewServeMux()
	mux.HandleFunc("GET /health", func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.WriteHeader(nethttp.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	chatHandler.Register(mux)
	server.HandlePrefix("/", mux)
	return server
}

