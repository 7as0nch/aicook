package checkpoint

import (
	"context"
	"sync"
)

// Store 抽象 deep runner 的 checkpoint 存储。
// MemoryStore（单机/本地）与 RedisStore（多副本共享）都实现它；
// Get/Set 满足 Eino 的 core.CheckPointStore，Delete 供本仓库续跑完成后清理。
type Store interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, checkpoint []byte) error
	Delete(key string)
}

var _ Store = (*MemoryStore)(nil)

// MemoryStore 用内存保存 deep runner 的 checkpoint，便于本地恢复对话状态。
type MemoryStore struct {
	mu   sync.RWMutex
	data map[string][]byte
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		data: make(map[string][]byte),
	}
}

func (s *MemoryStore) Get(_ context.Context, key string) ([]byte, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.data[key]
	if !ok {
		return nil, false, nil
	}
	copied := append([]byte(nil), value...)
	return copied, true, nil
}

func (s *MemoryStore) Set(_ context.Context, key string, checkpoint []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = append([]byte(nil), checkpoint...)
	return nil
}

func (s *MemoryStore) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, key)
}
