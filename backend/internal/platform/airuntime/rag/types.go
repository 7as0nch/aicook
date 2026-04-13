package rag

import (
	"context"
	"time"
)

// EmbedBatchFunc 抽象向量模型批量嵌入，便于业务层注入现有 embeddings.Client。
type EmbedBatchFunc func(context.Context, []string) ([][]float32, error)

// Chunk 表示切分后的单个知识片段。
type Chunk struct {
	No        int
	Content   string
	Snippet   string
	TokenSize int
	Vector    []float32
	Metadata  map[string]any
}

// ExtractStats 记录文档抽取阶段的诊断信息，便于日志、元数据和重试提示复用。
type ExtractStats struct {
	Extractor      string
	ErrorKind      string
	StopReason     string
	LastError      string
	Partial        bool
	PageCount      int
	StartPage      int
	NextPage       int
	Completed      bool
	PagesProcessed int
	PagesSucceeded int
	PagesFailed    int
	LastPage       int
	DurationMS     int64
}

// ExtractOptions 控制抽取行为；当前主要用于 PDF 分段续跑。
type ExtractOptions struct {
	Timeout      time.Duration
	PDFStartPage int
}

// ExtractResult 表示文档抽取后的结果。
type ExtractResult struct {
	EffectiveContentType string
	TextContent          string
	Unsupported          bool
	UnsupportedReason    string
	Stats                ExtractStats
}

// SplitConfig 控制切分粒度与重叠长度。
type SplitConfig struct {
	ChunkSize int
	Overlap   int
}

// EmbedResult 表示向量化输出。
type EmbedResult struct {
	Chunks         []Chunk
	VectorCount    int
	EmbeddingError error
}
