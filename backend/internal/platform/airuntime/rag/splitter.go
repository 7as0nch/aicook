package rag

import (
	"context"
	"strings"
	"unicode/utf8"

	recursive "github.com/cloudwego/eino-ext/components/document/transformer/splitter/recursive"
	"github.com/cloudwego/eino/schema"
)

const (
	defaultChunkSize = 1200
	defaultOverlap   = 300
)

var splitBoundaries = []string{"\n\n", "\n", "。", "！", "？", ". ", ";", "；", "，", ",", " "}

// SplitText 使用 Eino recursive splitter 进行切分，避免知识库继续维护手写切分逻辑。
func SplitText(text string, cfg SplitConfig, metadata map[string]any) ([]Chunk, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, nil
	}
	chunkSize := cfg.ChunkSize
	if chunkSize <= 0 {
		chunkSize = defaultChunkSize
	}
	overlap := cfg.Overlap
	if overlap < 0 {
		overlap = 0
	}
	if overlap >= chunkSize {
		overlap = chunkSize / 4
	}

	splitter, err := recursive.NewSplitter(context.Background(), &recursive.Config{
		ChunkSize:   chunkSize,
		OverlapSize: overlap,
		Separators:  append([]string(nil), splitBoundaries...),
		LenFunc:     utf8.RuneCountInString,
		KeepType:    recursive.KeepTypeEnd,
	})
	if err != nil {
		return nil, err
	}

	docs, err := splitter.Transform(context.Background(), []*schema.Document{{
		ID:       "knowledge-document",
		Content:  text,
		MetaData: cloneMetadata(metadata),
	}})
	if err != nil {
		return nil, err
	}

	chunks := make([]Chunk, 0, len(docs))
	for _, doc := range docs {
		content := strings.TrimSpace(doc.Content)
		if content == "" {
			continue
		}
		chunkMeta := cloneMetadata(doc.MetaData)
		chunkMeta["chunk_no"] = len(chunks) + 1
		chunks = append(chunks, Chunk{
			No:        len(chunks) + 1,
			Content:   content,
			Snippet:   preview(content, 120),
			TokenSize: utf8.RuneCountInString(content),
			Metadata:  chunkMeta,
		})
	}
	return chunks, nil
}

func preview(raw string, size int) string {
	runes := []rune(strings.TrimSpace(raw))
	if len(runes) <= size {
		return string(runes)
	}
	return string(runes[:size]) + "..."
}

func cloneMetadata(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(input))
	for k, v := range input {
		out[k] = v
	}
	return out
}
