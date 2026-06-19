package server

import (
	"time"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/conf"
	svcai "github.com/chengjiang/aicook/backend/internal/service/ai"
	svckitchen "github.com/chengjiang/aicook/backend/internal/service/kitchen"
	svcrecipe "github.com/chengjiang/aicook/backend/internal/service/recipe"
	svcuser "github.com/chengjiang/aicook/backend/internal/service/user"
	kratosgrpc "github.com/go-kratos/kratos/v2/transport/grpc"
)

func NewGRPCServer(cfg *conf.Bootstrap, authSvc *svcuser.AuthService, householdSvc *svcuser.HouseholdService, recipeSvc *svcrecipe.RecipeService, mediaSvc *svcuser.MediaService, voiceSvc *svcai.VoiceService, importSvc *svcrecipe.ImportService, knowledgeSvc *svcai.KnowledgeService, aiSvc *svcai.AIService, cookingSvc *svckitchen.CookingService, kitchenSvc *svckitchen.KitchenService) *kratosgrpc.Server {
	timeout := cfg.GetServer().GetGrpc().GetTimeout().AsDuration()
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	options := []kratosgrpc.ServerOption{
		kratosgrpc.Address(cfg.GetServer().GetGrpc().GetAddr()),
		kratosgrpc.Timeout(timeout),
	}
	if network := cfg.GetServer().GetGrpc().GetNetwork(); network != "" {
		options = append(options, kratosgrpc.Network(network))
	}

	server := kratosgrpc.NewServer(options...)
	v1.RegisterAuthServiceServer(server, authSvc)
	v1.RegisterHouseholdServiceServer(server, householdSvc)
	v1.RegisterRecipeServiceServer(server, recipeSvc)
	v1.RegisterMediaServiceServer(server, mediaSvc)
	v1.RegisterVoiceServiceServer(server, voiceSvc)
	v1.RegisterImportServiceServer(server, importSvc)
	v1.RegisterKnowledgeServiceServer(server, knowledgeSvc)
	v1.RegisterAIServiceServer(server, aiSvc)
	v1.RegisterCookingServiceServer(server, cookingSvc)
	if kitchenSvc != nil {
		v1.RegisterKitchenServiceServer(server, kitchenSvc)
	}
	return server
}
