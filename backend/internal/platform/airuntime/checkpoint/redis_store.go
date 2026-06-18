package checkpoint

import (
	"context"
	"errors"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/redis/go-redis/v9"
)

// RedisStore 把 deep runner 的 checkpoint 存到 Redis，使多副本部署 / 发版重启后仍能续跑（如审批回路）。
// checkpoint 只为短期续跑服务，写入带 TTL 兜底，避免遗留键堆积。
type RedisStore struct {
	rdb    *redis.Client
	prefix string
	ttl    time.Duration
}

var _ Store = (*RedisStore)(nil)

// checkpointTTL 是遗留键的兜底过期时间。正常流程结束会显式 Delete；TTL 只为「用户一直没回审批」
// 的废弃 checkpoint 自动清理。设 24h，覆盖「隔天再回来确认审批」的场景，又不会长期堆积。
const checkpointTTL = 24 * time.Hour

func NewRedisStore(rdb *redis.Client) *RedisStore {
	return &RedisStore{
		rdb:    rdb,
		prefix: "aicook:ai:ckpt:",
		ttl:    checkpointTTL,
	}
}

func (s *RedisStore) redisKey(key string) string { return s.prefix + key }

func (s *RedisStore) Get(ctx context.Context, key string) ([]byte, bool, error) {
	if s == nil || s.rdb == nil {
		return nil, false, nil
	}
	// checkpoint 读在「审批续跑」关键路径上：远端 Redis 偶发抖动/超时时重试几次，
	// 避免一次 i/o timeout 就把整条对话判为「checkpoint 不存在」而失败。
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		val, err := s.rdb.Get(ctx, s.redisKey(key)).Bytes()
		if err == nil {
			return val, true, nil
		}
		if errors.Is(err, redis.Nil) {
			return nil, false, nil // 确实不存在，不重试
		}
		lastErr = err
		if ctx.Err() != nil {
			break // 请求已取消，不再重试
		}
		time.Sleep(time.Duration(attempt+1) * 150 * time.Millisecond)
	}
	// 重试仍失败 → 按「无 checkpoint」降级：让流不至于崩（用户重发即可），但日志告警。
	log.Warnf("checkpoint redis get failed after retries: key=%s err=%v", key, lastErr)
	return nil, false, nil
}

func (s *RedisStore) Set(ctx context.Context, key string, checkpoint []byte) error {
	if s == nil || s.rdb == nil {
		return nil
	}
	if err := s.rdb.Set(ctx, s.redisKey(key), checkpoint, s.ttl).Err(); err != nil {
		// 刻意尽力而为、返回 nil 不打断本次对话：Eino 每轮都会 Set 快照（无审批时随后即被 Delete），
		// 若把错误抛回去，Redis 抖动会让【所有】对话都失败。代价是 Redis 异常期间审批续跑会丢 checkpoint
		// （续跑时报 not-exist，用户重发即可）——这是用户向聊天流里更可接受的降级。
		log.Warnf("checkpoint redis set failed: key=%s err=%v", key, err)
	}
	return nil
}

func (s *RedisStore) Delete(key string) {
	if s == nil || s.rdb == nil {
		return
	}
	// 清理是 fire-and-forget：用独立的有界 context——既不随请求取消（否则会漏删，只能靠 TTL 兜底），
	// 也不会无限阻塞。
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.rdb.Del(ctx, s.redisKey(key)).Err(); err != nil {
		log.Warnf("checkpoint redis delete failed: key=%s err=%v", key, err)
	}
}
