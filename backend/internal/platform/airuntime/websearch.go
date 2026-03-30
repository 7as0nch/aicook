package airuntime

import (
	"context"
	"fmt"
	"strings"
	"time"

	duckduckgo "github.com/cloudwego/eino-ext/components/tool/duckduckgo/v2"
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
