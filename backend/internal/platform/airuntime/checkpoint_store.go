package airuntime

import (
	"context"
	"sync"
)

type memoryCheckpointStore struct {
	mu   sync.RWMutex
	data map[string][]byte
}

func newMemoryCheckpointStore() *memoryCheckpointStore {
	return &memoryCheckpointStore{
		data: make(map[string][]byte),
	}
}

func (s *memoryCheckpointStore) Get(_ context.Context, key string) ([]byte, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.data[key]
	if !ok {
		return nil, false, nil
	}
	copied := append([]byte(nil), value...)
	return copied, true, nil
}

func (s *memoryCheckpointStore) Set(_ context.Context, key string, checkpoint []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = append([]byte(nil), checkpoint...)
	return nil
}

func (s *memoryCheckpointStore) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, key)
}
