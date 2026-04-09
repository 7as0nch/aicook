package data

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/chengjiang/aicook/backend/internal/consts"
	"github.com/redis/go-redis/v9"
)

var ErrRedisUnavailable = errors.New("redis unavailable")

// CookingProgressRecord is stored as JSON in a Redis HASH field (recipe id string).
type CookingProgressRecord struct {
	StepIndex            int   `json:"step_index"`
	TotalSteps           int   `json:"total_steps"`
	TimerTotalSeconds    int   `json:"timer_total_seconds"`
	TimerStartedAtMS     int64 `json:"timer_started_at_ms"`
	TimerPausedRemaining int   `json:"timer_paused_remaining"`
	UpdatedAtMS          int64 `json:"updated_at_ms"`
}

type CookingProgressStore struct {
	rdb *redis.Client
}

func NewCookingProgressStore(rdb *redis.Client) *CookingProgressStore {
	return &CookingProgressStore{rdb: rdb}
}

func (s *CookingProgressStore) activeKey(userID int64) string {
	return fmt.Sprintf(consts.CookingActiveKeyFmt, userID)
}

// ListAll returns parsed HASH entries; nil/closed Redis yields empty map, no error.
func (s *CookingProgressStore) ListAll(ctx context.Context, userID int64) (map[int64]CookingProgressRecord, error) {
	if s == nil || s.rdb == nil {
		return map[int64]CookingProgressRecord{}, nil
	}
	key := s.activeKey(userID)
	raw, err := s.rdb.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	out := make(map[int64]CookingProgressRecord, len(raw))
	for field, val := range raw {
		rid, err := strconv.ParseInt(field, 10, 64)
		if err != nil {
			continue
		}
		var rec CookingProgressRecord
		if err := json.Unmarshal([]byte(val), &rec); err != nil {
			continue
		}
		out[rid] = rec
	}
	return out, nil
}

func (s *CookingProgressStore) Set(ctx context.Context, userID, recipeID int64, rec CookingProgressRecord) error {
	if s == nil || s.rdb == nil {
		return ErrRedisUnavailable
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	key := s.activeKey(userID)
	field := strconv.FormatInt(recipeID, 10)
	pipe := s.rdb.Pipeline()
	pipe.HSet(ctx, key, field, string(b))
	pipe.Expire(ctx, key, consts.CookingKeyTTL)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *CookingProgressStore) Delete(ctx context.Context, userID, recipeID int64) error {
	if s == nil || s.rdb == nil {
		return ErrRedisUnavailable
	}
	key := s.activeKey(userID)
	field := strconv.FormatInt(recipeID, 10)
	return s.rdb.HDel(ctx, key, field).Err()
}
