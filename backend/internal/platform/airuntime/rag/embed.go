package rag

import (
	"context"
	"fmt"
)

// EmbedChunks 批量写入向量；若向量阶段失败，返回原 chunks 和错误，由业务层决定是否以失败状态保存文本块。
func EmbedChunks(ctx context.Context, chunks []Chunk, embed EmbedBatchFunc) EmbedResult {
	if len(chunks) == 0 {
		return EmbedResult{Chunks: chunks}
	}
	if embed == nil {
		return EmbedResult{Chunks: chunks, EmbeddingError: fmt.Errorf("embedding client is not configured")}
	}
	texts := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		texts = append(texts, chunk.Content)
	}
	vecs, err := embed(ctx, texts)
	if err != nil {
		return EmbedResult{Chunks: chunks, EmbeddingError: err}
	}
	if len(vecs) != len(chunks) {
		return EmbedResult{Chunks: chunks, EmbeddingError: fmt.Errorf("embeddings: got %d vectors for %d chunks", len(vecs), len(chunks))}
	}
	result := make([]Chunk, 0, len(chunks))
	vectorCount := 0
	expectedDim := 0
	for i, chunk := range chunks {
		copied := chunk
		if expectedDim == 0 {
			expectedDim = len(vecs[i])
		}
		if expectedDim <= 0 {
			return EmbedResult{Chunks: chunks, EmbeddingError: fmt.Errorf("embeddings: empty vector")}
		}
		if len(vecs[i]) != expectedDim {
			return EmbedResult{Chunks: chunks, EmbeddingError: fmt.Errorf("embeddings: expected dim %d, got %d", expectedDim, len(vecs[i]))}
		}
		copied.Vector = append([]float32(nil), vecs[i]...)
		vectorCount++
		result = append(result, copied)
	}
	return EmbedResult{Chunks: result, VectorCount: vectorCount}
}
