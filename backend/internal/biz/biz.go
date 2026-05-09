package biz

import "github.com/google/wire"

var ProviderSet = wire.NewSet(
	NewAuthUsecase,
	NewHouseholdUsecase,
	NewRecipeUsecase,
	NewMediaUsecase,
	NewVoiceUsecase,
	NewImportUsecase,
	NewKnowledgeUsecase,
	NewAIUsecase,
	NewCookingProgressUsecase,
	NewKitchenOpsUsecase,
	NewCookingHistoryUsecase,
	NewRecommendUsecase,
)
