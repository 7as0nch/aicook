package conf

import "sync"

// EmbeddingSettings 保存与主聊天模型解耦的向量服务配置。
type EmbeddingSettings struct {
	Provider *EmbeddingProviderSet `json:"provider,omitempty" yaml:"provider,omitempty" mapstructure:"provider"`
}

// EmbeddingProviderSet 预留多 provider 扩展位，当前先支持 Doubao。
type EmbeddingProviderSet struct {
	Doubao *EmbeddingProviderConfig `json:"doubao,omitempty" yaml:"doubao,omitempty" mapstructure:"doubao"`
}

// EmbeddingProviderConfig 描述一个可直接调用 OpenAI 兼容 embeddings 接口的 provider。
type EmbeddingProviderConfig struct {
	BaseURL    string `json:"base_url,omitempty" yaml:"base_url,omitempty" mapstructure:"base_url"`
	Model      string `json:"model,omitempty" yaml:"model,omitempty" mapstructure:"model"`
	APIKey     string `json:"api_key,omitempty" yaml:"api_key,omitempty" mapstructure:"api_key"`
	APIType    string `json:"api_type,omitempty" yaml:"api_type,omitempty" mapstructure:"api_type"`
	Dimensions int32  `json:"dimensions,omitempty" yaml:"dimensions,omitempty" mapstructure:"dimensions"`
}

type bootstrapEmbeddingState struct {
	Embedding *EmbeddingSettings
}

var bootstrapEmbeddingOverrides sync.Map

func BindBootstrapEmbeddingSettings(cfg *Bootstrap, embedding *EmbeddingSettings) {
	if cfg == nil {
		return
	}
	if embedding == nil {
		bootstrapEmbeddingOverrides.Delete(cfg)
		return
	}
	bootstrapEmbeddingOverrides.Store(cfg, &bootstrapEmbeddingState{Embedding: embedding})
}

func GetBootstrapEmbeddingSettings(cfg *Bootstrap) *EmbeddingSettings {
	if cfg == nil {
		return nil
	}
	raw, ok := bootstrapEmbeddingOverrides.Load(cfg)
	if !ok || raw == nil {
		return nil
	}
	state, ok := raw.(*bootstrapEmbeddingState)
	if !ok || state == nil {
		return nil
	}
	return state.Embedding
}

func GetBootstrapEmbeddingProvider(cfg *Bootstrap) *EmbeddingProviderConfig {
	settings := GetBootstrapEmbeddingSettings(cfg)
	if settings == nil || settings.Provider == nil {
		return nil
	}
	if settings.Provider.Doubao != nil {
		return settings.Provider.Doubao
	}
	return nil
}
