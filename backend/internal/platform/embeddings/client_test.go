package embeddings

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

func TestNewClientPrefersDedicatedEmbeddingProvider(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	payload := `server:
  name: test
data:
  pg_database:
    host: localhost
    port: 5432
    user: test
    password: test
    dbname: test
    sslmode: disable
    schema: public
  redis:
    addr: localhost:6379
oss:
  endpoint: localhost:9000
  public_endpoint: http://localhost:9000
  access_key: test
  secret_key: test
  media_bucket: media
  knowledge_bucket: kb
inference:
  endpoint: http://127.0.0.1:8088
ai:
  provider: xiaomi
  base_url: "https://api.xiaomimimo.com/v1"
  api_key: "chat-key"
  chat_model: "mimo-v2-pro"
  embedding_model: "legacy-embedding-model"
  embedding:
    provider:
      doubao:
        base_url: "https://ark.cn-beijing.volces.com/api/v3"
        model: "doubao-embedding-vision-251215"
        api_key: "embed-key"
        api_type: "multimodal"
        dimensions: 1024
`
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	cfg, err := conf.LoadBootstrap(path)
	if err != nil {
		t.Fatalf("LoadBootstrap returned error: %v", err)
	}
	client := NewClient(cfg)
	if client == nil {
		t.Fatalf("expected embedding client")
	}
	if client.baseURL != "https://ark.cn-beijing.volces.com/api/v3" {
		t.Fatalf("unexpected baseURL: %s", client.baseURL)
	}
	if client.model != "doubao-embedding-vision-251215" {
		t.Fatalf("unexpected model: %s", client.model)
	}
	if client.apiKey != "embed-key" {
		t.Fatalf("unexpected api key: %s", client.apiKey)
	}
	if client.apiType != "multimodal" {
		t.Fatalf("unexpected api type: %s", client.apiType)
	}
	if client.dimensions != 1024 {
		t.Fatalf("unexpected dimensions: %d", client.dimensions)
	}
	if client.initErr != nil {
		t.Fatalf("unexpected init error: %v", client.initErr)
	}
}

func TestNewClientFallsBackToLegacyEmbeddingFields(t *testing.T) {
	cfg := &conf.Bootstrap{
		Ai: &conf.AI{
			BaseUrl:        "https://legacy.example.com/v1",
			ApiKey:         "legacy-key",
			EmbeddingModel: "legacy-model",
		},
	}

	client := NewClient(cfg)
	if client == nil {
		t.Fatalf("expected fallback embedding client")
	}
	if client.baseURL != "https://legacy.example.com/v1" {
		t.Fatalf("unexpected baseURL: %s", client.baseURL)
	}
	if client.model != "legacy-model" {
		t.Fatalf("unexpected model: %s", client.model)
	}
	if client.apiKey != "legacy-key" {
		t.Fatalf("unexpected api key: %s", client.apiKey)
	}
	if client.initErr != nil {
		t.Fatalf("unexpected init error: %v", client.initErr)
	}
}
