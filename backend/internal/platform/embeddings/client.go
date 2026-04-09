package embeddings

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

// Dimensions 与 deploy/sql/base.sql 中 knowledge_chunks.embedding VECTOR(1536) 一致。
const Dimensions = 1536

const maxBatch = 64

type Client struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
	model      string
}

func NewClient(ai *conf.AI) *Client {
	if ai == nil || strings.TrimSpace(ai.GetEmbeddingModel()) == "" {
		return nil
	}
	base := strings.TrimSuffix(strings.TrimSpace(ai.GetBaseUrl()), "/")
	if base == "" {
		return nil
	}
	return &Client{
		httpClient: &http.Client{Timeout: 90 * time.Second},
		baseURL:    base,
		apiKey:     ai.GetApiKey(),
		model:      ai.GetEmbeddingModel(),
	}
}

type apiRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type apiResponse struct {
	Data []struct {
		Index     int       `json:"index"`
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
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
	body, err := json.Marshal(apiRequest{Model: c.model, Input: texts})
	if err != nil {
		return nil, err
	}
	url := c.baseURL + "/embeddings"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embeddings: HTTP %d", resp.StatusCode)
	}
	var parsed apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	sort.Slice(parsed.Data, func(i, j int) bool {
		return parsed.Data[i].Index < parsed.Data[j].Index
	})
	out := make([][]float32, 0, len(parsed.Data))
	for _, row := range parsed.Data {
		vec := make([]float32, 0, len(row.Embedding))
		for _, v := range row.Embedding {
			vec = append(vec, float32(v))
		}
		if len(vec) != Dimensions {
			return nil, fmt.Errorf("embeddings: expected dim %d, got %d", Dimensions, len(vec))
		}
		out = append(out, vec)
	}
	if len(out) != len(texts) {
		return nil, fmt.Errorf("embeddings: got %d vectors for %d inputs", len(out), len(texts))
	}
	return out, nil
}
