package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/compose"
)

type WebSearchRequest struct {
	Query            string
	WebSearchEnabled bool
}

type WebSearchOutput struct {
	Status         string
	Summary        string
	Results        []Source
	ErrorMessage   string
	NeedWebEnabled bool
}

type WebSearchCallbacks struct {
	Search func(context.Context, string) ([]Source, string, error)
}

type webSearchState struct {
	Results        []Source
	ErrorMessage   string
	NeedWebEnabled bool
}

func RunWebSearch(ctx context.Context, req WebSearchRequest, callbacks WebSearchCallbacks, opts ...Option) (WebSearchOutput, error) {
	query := strings.TrimSpace(req.Query)
	if query == "" {
		return WebSearchOutput{}, fmt.Errorf("web search query is empty")
	}

	cfg := runnerConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}

	g := compose.NewGraph[WebSearchRequest, WebSearchOutput](compose.WithGenLocalState(func(context.Context) *webSearchState {
		return &webSearchState{}
	}))

	checkNode := compose.InvokableLambda(func(ctx context.Context, input WebSearchRequest) (WebSearchRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "web_search_check", Title: "web_search_check", Status: "running"})
		if input.WebSearchEnabled {
			appendStep(ctx, cfg.onStep, Step{ID: "web_search_check", Title: "web_search_check", Status: "done", Detail: "已开启网页搜索"})
			return input, nil
		}
		_ = compose.ProcessState[*webSearchState](ctx, func(_ context.Context, state *webSearchState) error {
			state.NeedWebEnabled = true
			return nil
		})
		appendStep(ctx, cfg.onStep, Step{ID: "web_search_check", Title: "web_search_check", Status: "blocked", Detail: "当前会话未开启网页搜索"})
		return input, nil
	})

	searchNode := compose.InvokableLambda(func(ctx context.Context, input WebSearchRequest) (WebSearchRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "web_search_execute", Title: "web_search_execute", Status: "running"})
		state := &webSearchState{}
		_ = compose.ProcessState[*webSearchState](ctx, func(_ context.Context, current *webSearchState) error {
			*state = *current
			return nil
		})
		if state.NeedWebEnabled {
			appendStep(ctx, cfg.onStep, Step{ID: "web_search_execute", Title: "web_search_execute", Status: "skipped", Detail: "未开启网页搜索，停止执行"})
			return input, nil
		}
		if callbacks.Search == nil {
			appendStep(ctx, cfg.onStep, Step{ID: "web_search_execute", Title: "web_search_execute", Status: "error", Detail: "未配置网页搜索执行器"})
			return WebSearchRequest{}, fmt.Errorf("web search callback is nil")
		}
		results, errorMessage, err := callbacks.Search(ctx, input.Query)
		if err != nil {
			appendStep(ctx, cfg.onStep, Step{ID: "web_search_execute", Title: "web_search_execute", Status: "error", Detail: err.Error()})
			return WebSearchRequest{}, err
		}
		_ = compose.ProcessState[*webSearchState](ctx, func(_ context.Context, current *webSearchState) error {
			current.Results = append([]Source(nil), results...)
			current.ErrorMessage = strings.TrimSpace(errorMessage)
			return nil
		})
		detail := "未命中网页结果"
		if len(results) > 0 {
			detail = fmt.Sprintf("已获取 %d 条网页结果", len(results))
		}
		if strings.TrimSpace(errorMessage) != "" && len(results) > 0 {
			detail = fmt.Sprintf("已获取 %d 条网页结果，搜索链路有提示", len(results))
		}
		if strings.TrimSpace(errorMessage) != "" && len(results) == 0 {
			detail = "搜索链路返回错误"
		}
		appendStep(ctx, cfg.onStep, Step{ID: "web_search_execute", Title: "web_search_execute", Status: "done", Detail: detail})
		return input, nil
	})

	finalizeNode := compose.InvokableLambda(func(ctx context.Context, input WebSearchRequest) (WebSearchOutput, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "web_search_finalize", Title: "web_search_finalize", Status: "running"})
		state := &webSearchState{}
		_ = compose.ProcessState[*webSearchState](ctx, func(_ context.Context, current *webSearchState) error {
			*state = *current
			return nil
		})
		if state.NeedWebEnabled {
			appendStep(ctx, cfg.onStep, Step{ID: "web_search_finalize", Title: "web_search_finalize", Status: "done", Detail: "网页搜索未开启"})
			return WebSearchOutput{
				Status:         "unsupported",
				Summary:        "当前会话未开启网页搜索，请先打开网页搜索开关后再试。",
				NeedWebEnabled: true,
			}, nil
		}
		if len(state.Results) > 0 {
			appendStep(ctx, cfg.onStep, Step{ID: "web_search_finalize", Title: "web_search_finalize", Status: "done", Detail: "网页搜索结果已准备完成"})
			summary := fmt.Sprintf("已完成网页搜索，共获取 %d 条结果。", len(state.Results))
			if state.ErrorMessage != "" {
				summary = fmt.Sprintf("已完成网页搜索，共获取 %d 条结果，搜索链路有提示。", len(state.Results))
			}
			return WebSearchOutput{
				Status:       "done",
				Summary:      summary,
				Results:      append([]Source(nil), state.Results...),
				ErrorMessage: state.ErrorMessage,
			}, nil
		}
		appendStep(ctx, cfg.onStep, Step{ID: "web_search_finalize", Title: "web_search_finalize", Status: "done", Detail: "网页搜索未返回结果"})
		summary := "网页搜索未返回有效结果。"
		if state.ErrorMessage != "" {
			summary = "网页搜索暂时失败，请稍后重试。"
		}
		return WebSearchOutput{
			Status:       "empty",
			Summary:      summary,
			Results:      nil,
			ErrorMessage: state.ErrorMessage,
		}, nil
	})

	if err := g.AddLambdaNode("check", checkNode); err != nil {
		return WebSearchOutput{}, err
	}
	if err := g.AddLambdaNode("search", searchNode); err != nil {
		return WebSearchOutput{}, err
	}
	if err := g.AddLambdaNode("finalize", finalizeNode); err != nil {
		return WebSearchOutput{}, err
	}
	if err := g.AddEdge(compose.START, "check"); err != nil {
		return WebSearchOutput{}, err
	}
	if err := g.AddEdge("check", "search"); err != nil {
		return WebSearchOutput{}, err
	}
	if err := g.AddEdge("search", "finalize"); err != nil {
		return WebSearchOutput{}, err
	}
	if err := g.AddEdge("finalize", compose.END); err != nil {
		return WebSearchOutput{}, err
	}

	runnable, err := g.Compile(ctx)
	if err != nil {
		return WebSearchOutput{}, err
	}
	return runnable.Invoke(ctx, WebSearchRequest{
		Query:            query,
		WebSearchEnabled: req.WebSearchEnabled,
	})
}
