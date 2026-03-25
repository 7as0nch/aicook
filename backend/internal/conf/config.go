package conf

import (
	"fmt"

	"github.com/go-kratos/kratos/v2/config"
	"github.com/go-kratos/kratos/v2/config/file"
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
