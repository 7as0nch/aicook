package conf

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadBootstrapReadsEmbeddingConfig(t *testing.T) {
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
ai:
  provider: xiaomi
  base_url: "https://api.xiaomimimo.com/v1"
  api_key: "chat-key"
  chat_model: "mimo-v2-pro"
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

	cfg, err := LoadBootstrap(path)
	if err != nil {
		t.Fatalf("LoadBootstrap returned error: %v", err)
	}
	provider := GetBootstrapEmbeddingProvider(cfg)
	if provider == nil {
		t.Fatalf("expected embedding provider config")
	}
	if provider.BaseURL != "https://ark.cn-beijing.volces.com/api/v3" {
		t.Fatalf("unexpected base url: %s", provider.BaseURL)
	}
	if provider.Model != "doubao-embedding-vision-251215" {
		t.Fatalf("unexpected model: %s", provider.Model)
	}
	if provider.APIKey != "embed-key" {
		t.Fatalf("unexpected api key: %s", provider.APIKey)
	}
	if provider.APIType != "multimodal" {
		t.Fatalf("unexpected api type: %s", provider.APIType)
	}
	if provider.Dimensions != 1024 {
		t.Fatalf("unexpected dimensions: %d", provider.Dimensions)
	}
}

func TestLoadBootstrapExpandsEnvPlaceholders(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	payload := `server:
  name: test
data:
  pg_database:
    host: localhost
    port: 5432
    user: test
    password: "${TEST_PG_PASSWORD}"
    dbname: test
    sslmode: disable
    schema: public
  redis:
    addr: localhost:6379
    password: "${TEST_REDIS_PASSWORD}"
oss:
  endpoint: localhost:9000
  public_endpoint: http://localhost:9000
  access_key: "${TEST_ACCESS_KEY}"
  secret_key: test
  media_bucket: media
  knowledge_bucket: kb
ai:
  provider: xiaomi
  api_key: "${TEST_MIMO_KEY}"
  embedding:
    provider:
      doubao:
        api_key: "${TEST_DOUBAO_KEY}"
        dimensions: 1024
`
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	t.Setenv("TEST_PG_PASSWORD", "pg$ecret") // 值里含 $，确认不会被二次展开
	t.Setenv("TEST_REDIS_PASSWORD", "redispw")
	t.Setenv("TEST_ACCESS_KEY", "ak-123")
	t.Setenv("TEST_MIMO_KEY", "sk-mimo")
	t.Setenv("TEST_DOUBAO_KEY", "doubao-xyz")

	cfg, err := LoadBootstrap(path)
	if err != nil {
		t.Fatalf("LoadBootstrap returned error: %v", err)
	}
	if got := cfg.GetData().GetPgDatabase().GetPassword(); got != "pg$ecret" {
		t.Fatalf("pg password not expanded / re-expanded: %q", got)
	}
	if got := cfg.GetData().GetRedis().GetPassword(); got != "redispw" {
		t.Fatalf("redis password not expanded: %q", got)
	}
	if got := cfg.GetOss().GetAccessKey(); got != "ak-123" {
		t.Fatalf("oss access_key not expanded: %q", got)
	}
	if got := cfg.GetAi().GetApiKey(); got != "sk-mimo" {
		t.Fatalf("ai api_key not expanded: %q", got)
	}
	provider := GetBootstrapEmbeddingProvider(cfg)
	if provider == nil || provider.APIKey != "doubao-xyz" {
		t.Fatalf("nested embedding api_key not expanded: %+v", provider)
	}
}

func TestLoadBootstrapFailsOnUnexpandedPlaceholder(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	payload := `server:
  name: test
data:
  pg_database:
    host: localhost
    port: 5432
    user: test
    password: "${TEST_DEFINITELY_UNSET}"
    dbname: test
    sslmode: disable
    schema: public
  redis:
    addr: localhost:6379
oss:
  endpoint: localhost:9000
  public_endpoint: http://localhost:9000
  access_key: a
  secret_key: b
  media_bucket: media
  knowledge_bucket: kb
ai:
  provider: xiaomi
`
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}
	// TEST_DEFINITELY_UNSET 不设置 —— LoadBootstrap 应报错并点名该占位。
	_, err := LoadBootstrap(path)
	if err == nil {
		t.Fatalf("expected error for unexpanded placeholder, got nil")
	}
	if !strings.Contains(err.Error(), "TEST_DEFINITELY_UNSET") {
		t.Fatalf("error should name the missing placeholder, got: %v", err)
	}
}
