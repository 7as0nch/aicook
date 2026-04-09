package data

import (
	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/platform/cache"
	"github.com/redis/go-redis/v9"
)

// NewRedis wires Bootstrap to the shared cache client constructor.
func NewRedis(cfg *conf.Bootstrap) (*redis.Client, func(), error) {
	return cache.NewRedis(cfg)
}
