package airuntime

import (
	"context"
	"fmt"
	"strings"
	"time"

	duckduckgo "github.com/cloudwego/eino-ext/components/tool/duckduckgo/v2"
	"github.com/cloudwego/eino/schema"

	graphruntime "github.com/chengjiang/aicook/backend/internal/platform/airuntime/graph"
)

func searchDuckDuckGo(ctx context.Context, query string) ([]Source, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("duckduckgo search query is empty")
	}
	searcher, err := duckduckgo.NewSearch(ctx, &duckduckgo.Config{
		Region:     duckduckgo.RegionCN,
		MaxResults: 5,
		Timeout:    12 * time.Second,
	})
	if err != nil {
		return nil, err
	}
	resp, err := searcher.TextSearch(ctx, &duckduckgo.TextSearchRequest{
		Query:     query,
		TimeRange: duckduckgo.TimeRangeAny,
	})
	if err != nil {
		return nil, fmt.Errorf("duckduckgo search failed: %w", err)
	}
	if resp == nil {
		return nil, fmt.Errorf("duckduckgo search returned empty response")
	}
	sources := make([]Source, 0, 5)
	for _, item := range resp.Results {
		if item == nil {
			continue
		}
		title := strings.TrimSpace(item.Title)
		if title == "" {
			title = "DuckDuckGo"
		}
		snippet := strings.TrimSpace(item.Summary)
		if snippet == "" {
			continue
		}
		sources = append(sources, Source{
			Title:      title,
			DocumentID: strings.TrimSpace(item.URL),
			Snippet:    snippet,
		})
	}
	return sources, nil
}

func (r *Runtime) shouldUseNativeWebSearch(req ReplyRequest) bool {
	return req.WebSearchEnabled && r.supportsNativeWebSearch()
}

func (r *Runtime) fallbackWebSearch(ctx context.Context, query string) ([]Source, error) {
	return searchDuckDuckGo(ctx, query)
}

func (r *Runtime) searchWithNativeModel(ctx context.Context, req ReplyRequest, query string) ([]Source, string, error) {
	model, _, err := r.selectChatModel(false)
	if err != nil {
		return nil, "", err
	}
	searchCtx := withCitationsCollector(ctx)
	messages := []*schema.Message{
		{
			Role:    schema.System,
			Content: "你是 AICook 的网页搜索执行器。请先执行网页搜索，再用极简中文总结最相关结果。",
		},
		{
			Role:    schema.User,
			Content: "请联网搜索并整理与以下问题最相关的网页结果：" + strings.TrimSpace(query),
		},
	}
	_, err = r.generateMessage(searchCtx, model, messages, r.buildNativeWebSearchOptions(req)...)
	if err != nil {
		return nil, "", err
	}
	return citationsFromContext(searchCtx), searchErrorFromContext(searchCtx), nil
}

func (r *Runtime) executeWebSearch(ctx context.Context, req ReplyRequest, query string) ([]Source, string, error) {
	if r.shouldUseNativeWebSearch(req) {
		return r.searchWithNativeModel(ctx, req, query)
	}
	results, err := r.fallbackWebSearch(ctx, query)
	return results, "", err
}

func (r *Runtime) runWebSearchGraph(ctx context.Context, req ReplyRequest, query string, bridge *streamBridge) (*graphruntime.WebSearchOutput, error) {
	output, err := graphruntime.RunWebSearch(ctx, graphruntime.WebSearchRequest{
		Query:            strings.TrimSpace(query),
		WebSearchEnabled: req.WebSearchEnabled,
	}, graphruntime.WebSearchCallbacks{
		Search: func(ctx context.Context, question string) ([]graphruntime.Source, string, error) {
			results, errorMessage, err := r.executeWebSearch(ctx, req, question)
			if err != nil {
				return nil, "", err
			}
			return toGraphSources(results), errorMessage, nil
		},
	}, graphruntime.WithStepObserver(func(_ context.Context, step graphruntime.Step) {
		if bridge == nil {
			return
		}
		_ = bridge.emitWorkflow(WorkflowStep{
			ID:     step.ID,
			Title:  graphruntime.LocalizeStepTitle(step.Title),
			Status: step.Status,
			Detail: graphruntime.LocalizeStepDetail(step.Detail),
		})
	}))
	if err != nil {
		return nil, err
	}
	return &output, nil
}
