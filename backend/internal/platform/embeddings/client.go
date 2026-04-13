package embeddings

import (
	"context"
	"fmt"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/conf"
	arkembed "github.com/cloudwego/eino-ext/components/embedding/ark"
)

const maxBatch = 64

type Client struct {
	embedder   *arkembed.Embedder
	baseURL    string
	apiKey     string
	model      string
	apiType    string
	dimensions int
	initErr    error
}

func NewClient(cfg *conf.Bootstrap) *Client {
	if cfg == nil {
		return nil
	}
	base, apiKey, model, apiType, dimensions := resolveEmbeddingEndpoint(cfg)
	if base == "" || model == "" {
		return nil
	}
	embedderCfg := &arkembed.EmbeddingConfig{
		BaseURL: base,
		APIKey:  apiKey,
		Model:   model,
	}
	if parsedType := parseArkAPIType(apiType, model); parsedType != nil {
		embedderCfg.APIType = parsedType
	}
	embedder, err := arkembed.NewEmbedder(context.Background(), embedderCfg)
	return &Client{
		embedder:   embedder,
		baseURL:    base,
		apiKey:     apiKey,
		model:      model,
		apiType:    apiType,
		dimensions: dimensions,
		initErr:    err,
	}
}

func (c *Client) Model() string {
	if c == nil {
		return ""
	}
	return strings.TrimSpace(c.model)
}

func (c *Client) Embed(ctx context.Context, text string) ([]float32, error) {
	vecs, err := c.EmbedBatch(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	if len(vecs) == 0 {
		return nil, fmt.Errorf("embeddings: empty data")
	}
	return vecs[0], nil
}

func (c *Client) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	if c == nil {
		return nil, fmt.Errorf("embeddings: nil client")
	}
	if c.initErr != nil {
		return nil, fmt.Errorf("embeddings: init ark embedder: %w", c.initErr)
	}
	if c.embedder == nil {
		return nil, fmt.Errorf("embeddings: nil ark embedder")
	}
	if len(texts) == 0 {
		return nil, nil
	}
	var out [][]float32
	for start := 0; start < len(texts); start += maxBatch {
		end := start + maxBatch
		if end > len(texts) {
			end = len(texts)
		}
		batch, err := c.embedSlice(ctx, texts[start:end])
		if err != nil {
			return nil, err
		}
		out = append(out, batch...)
	}
	return out, nil
}

func (c *Client) embedSlice(ctx context.Context, texts []string) ([][]float32, error) {
	vecs, err := c.embedder.EmbedStrings(ctx, texts)
	if err != nil {
		return nil, fmt.Errorf("embeddings: ark embed strings: %w", err)
	}
	if len(vecs) != len(texts) {
		return nil, fmt.Errorf("embeddings: got %d vectors for %d inputs", len(vecs), len(texts))
	}
	out := make([][]float32, 0, len(vecs))
	expectedDim := c.dimensions
	for _, row := range vecs {
		vec := make([]float32, 0, len(row))
		for _, v := range row {
			vec = append(vec, float32(v))
		}
		if expectedDim == 0 {
			expectedDim = len(vec)
		}
		if expectedDim <= 0 {
			return nil, fmt.Errorf("embeddings: empty vector")
		}
		if len(vec) != expectedDim {
			return nil, fmt.Errorf("embeddings: expected dim %d, got %d (check ai.embedding.provider.*.dimensions or remove it to accept the provider default)", expectedDim, len(vec))
		}
		out = append(out, vec)
	}
	return out, nil
}

func resolveEmbeddingEndpoint(cfg *conf.Bootstrap) (baseURL, apiKey, model, apiType string, dimensions int) {
	if provider := conf.GetBootstrapEmbeddingProvider(cfg); provider != nil {
		baseURL = strings.TrimSuffix(strings.TrimSpace(provider.BaseURL), "/")
		model = strings.TrimSpace(provider.Model)
		apiKey = strings.TrimSpace(provider.APIKey)
		apiType = strings.TrimSpace(provider.APIType)
		dimensions = int(provider.Dimensions)
		if baseURL != "" && model != "" {
			return baseURL, apiKey, model, apiType, dimensions
		}
	}

	ai := cfg.GetAi()
	if ai == nil || strings.TrimSpace(ai.GetEmbeddingModel()) == "" {
		return "", "", "", "", 0
	}
	baseURL = strings.TrimSuffix(strings.TrimSpace(ai.GetBaseUrl()), "/")
	model = strings.TrimSpace(ai.GetEmbeddingModel())
	apiKey = strings.TrimSpace(ai.GetApiKey())
	if baseURL == "" || model == "" {
		return "", "", "", "", 0
	}
	return baseURL, apiKey, model, "", 0
}

func parseArkAPIType(raw, model string) *arkembed.APIType {
	raw = strings.ToLower(strings.TrimSpace(raw))
	switch raw {
	case "text", "text_api":
		apiType := arkembed.APITypeText
		return &apiType
	case "multimodal", "multi_modal", "multi-modal", "multi_modal_api", "vision":
		apiType := arkembed.APITypeMultiModal
		return &apiType
	}
	if strings.Contains(strings.ToLower(strings.TrimSpace(model)), "vision") {
		apiType := arkembed.APITypeMultiModal
		return &apiType
	}
	return nil
}
