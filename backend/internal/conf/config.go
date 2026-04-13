package conf

import (
	"fmt"
	"os"

	"github.com/go-kratos/kratos/v2/config"
	"github.com/go-kratos/kratos/v2/config/file"
	"gopkg.in/yaml.v3"
)

func LoadBootstrap(path string) (*Bootstrap, error) {
	c := config.New(config.WithSource(file.NewSource(path)))
	defer c.Close()

	if err := c.Load(); err != nil {
		return nil, err
	}

	var bc Bootstrap
	if err := c.Scan(&bc); err != nil {
		return nil, err
	}
	if err := loadBootstrapEmbeddingConfig(path, &bc); err != nil {
		return nil, err
	}
	return &bc, nil
}

func (c *PGDatabase) DSN() string {
	if c == nil {
		return ""
	}

	schema := c.GetSchema()
	if schema == "" {
		schema = "public"
	}
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s search_path=%s",
		c.GetHost(),
		c.GetPort(),
		c.GetUser(),
		c.GetPassword(),
		c.GetDbname(),
		c.GetSslmode(),
		schema,
	)
}

type bootstrapConfigExtras struct {
	AI *aiConfigExtras `yaml:"ai"`
}

type aiConfigExtras struct {
	Embedding *EmbeddingSettings `yaml:"embedding"`
}

func loadBootstrapEmbeddingConfig(path string, bc *Bootstrap) error {
	if bc == nil {
		return nil
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var extras bootstrapConfigExtras
	if err := yaml.Unmarshal(payload, &extras); err != nil {
		return err
	}
	BindBootstrapEmbeddingSettings(bc, nil)
	if extras.AI == nil {
		return nil
	}
	BindBootstrapEmbeddingSettings(bc, extras.AI.Embedding)
	return nil
}
