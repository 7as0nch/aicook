package cache

import (
	"time"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/redis/go-redis/v9"
)

// NewRedis returns a go-redis client and a cleanup function. If redis addr is empty,
// returns (nil, func() {}, nil) for graceful degradation.
func NewRedis(cfg *conf.Bootstrap) (*redis.Client, func(), error) {
	if cfg == nil || cfg.GetData() == nil || cfg.GetData().GetRedis() == nil {
		return nil, func() {}, nil
	}
	r := cfg.GetData().GetRedis()
	addr := r.GetAddr()
	if addr == "" {
		return nil, func() {}, nil
	}

	opts := &redis.Options{
		Addr:     addr,
		Password: r.GetPassword(),
	}
	if d := r.GetReadTimeout(); d != nil {
		opts.ReadTimeout = d.AsDuration()
	}
	if d := r.GetWriteTimeout(); d != nil {
		opts.WriteTimeout = d.AsDuration()
	}
	if opts.ReadTimeout <= 0 {
		opts.ReadTimeout = 3 * time.Second
	}
	if opts.WriteTimeout <= 0 {
		opts.WriteTimeout = 3 * time.Second
	}

	client := redis.NewClient(opts)
	cleanup := func() { _ = client.Close() }
	return client, cleanup, nil
}
