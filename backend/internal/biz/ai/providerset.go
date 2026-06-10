package ai

import "github.com/google/wire"

var ProviderSet = wire.NewSet(
	NewAIUsecase,
	NewKnowledgeUsecase,
	NewVoiceUsecase,
)
