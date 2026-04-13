package graph

import (
	"context"
	"errors"
	"fmt"

	"github.com/cloudwego/eino/compose"
)

// ErrPipelineSkipped 表示本步刻意跳过（例如未配置模型），不算失败。
var ErrPipelineSkipped = errors.New("knowledge pipeline skipped")

// DocumentKnowledgeInput 文档入库后图谱流水线输入（向量阶段通常已在业务层完成）。
type DocumentKnowledgeInput struct {
	HouseholdID int64
	BaseID      int64
	DocumentID  int64
	Title       string
	TextContent string
}

// DocumentKnowledgeCallbacks 由 biz 层注入，避免本包依赖 biz。
type DocumentKnowledgeCallbacks struct {
	// IngestGraph 执行知识图谱抽取 + 持久化 + 菜谱关联（与向量解耦）。
	IngestGraph func(ctx context.Context, in DocumentKnowledgeInput) error
}

// RunDocumentKnowledgePipeline 编排可观测步骤：向量说明 → 图谱入库。
func RunDocumentKnowledgePipeline(ctx context.Context, in DocumentKnowledgeInput, cb DocumentKnowledgeCallbacks, opts ...Option) error {
	cfg := runnerConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}
	if cb.IngestGraph == nil {
		return fmt.Errorf("document knowledge: IngestGraph callback is nil")
	}

	g := compose.NewGraph[DocumentKnowledgeInput, struct{}]()

	vectorNode := compose.InvokableLambda(func(ctx context.Context, input DocumentKnowledgeInput) (DocumentKnowledgeInput, error) {
		appendStep(ctx, cfg.onStep, Step{
			ID:     "doc_knowledge_vector",
			Title:  "doc_knowledge_vector",
			Status: "skipped",
			Detail: "向量与切块已在知识库入库阶段完成",
		})
		return input, nil
	})

	graphNode := compose.InvokableLambda(func(ctx context.Context, input DocumentKnowledgeInput) (struct{}, error) {
		appendStep(ctx, cfg.onStep, Step{
			ID:     "doc_knowledge_graph",
			Title:  "doc_knowledge_graph",
			Status: "running",
		})
		if err := cb.IngestGraph(ctx, input); err != nil {
			if errors.Is(err, ErrPipelineSkipped) {
				appendStep(ctx, cfg.onStep, Step{
					ID:     "doc_knowledge_graph",
					Title:  "doc_knowledge_graph",
					Status: "skipped",
					Detail: "未配置模型或跳过图谱抽取",
				})
				return struct{}{}, nil
			}
			appendStep(ctx, cfg.onStep, Step{
				ID:     "doc_knowledge_graph",
				Title:  "doc_knowledge_graph",
				Status: "error",
				Detail: err.Error(),
			})
			return struct{}{}, err
		}
		appendStep(ctx, cfg.onStep, Step{
			ID:     "doc_knowledge_graph",
			Title:  "doc_knowledge_graph",
			Status: "done",
			Detail: "知识图谱已更新",
		})
		return struct{}{}, nil
	})

	if err := g.AddLambdaNode("vector", vectorNode); err != nil {
		return err
	}
	if err := g.AddLambdaNode("graph", graphNode); err != nil {
		return err
	}
	if err := g.AddEdge(compose.START, "vector"); err != nil {
		return err
	}
	if err := g.AddEdge("vector", "graph"); err != nil {
		return err
	}
	if err := g.AddEdge("graph", compose.END); err != nil {
		return err
	}

	runnable, err := g.Compile(ctx)
	if err != nil {
		return err
	}
	_, err = runnable.Invoke(ctx, in)
	return err
}
