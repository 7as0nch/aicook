package ai

import "github.com/google/wire"

// ProviderSet AI 域 service：会话/消息、知识库、语音。
var ProviderSet = wire.NewSet(
	NewAIService,
	NewKnowledgeService,
	NewVoiceService,
)
