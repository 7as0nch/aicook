package service

import "github.com/google/wire"

var ProviderSet = wire.NewSet(
	NewAuthService,
	NewHouseholdService,
	NewRecipeService,
	NewMediaService,
	NewVoiceService,
	NewImportService,
	NewKnowledgeService,
	NewAIService,
)
