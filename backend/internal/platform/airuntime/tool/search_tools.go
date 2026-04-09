package airtool

import (
	"context"
	"fmt"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
)

type QueryArgs struct {
	Query string `json:"query"`
	Limit int    `json:"limit,omitempty"`
}

type SearchResult struct {
	Query          string   `json:"query"`
	Status         string   `json:"status,omitempty"`
	Summary        string   `json:"summary,omitempty"`
	Results        []Source `json:"results"`
	ErrorMessage   string   `json:"error_message,omitempty"`
	NeedWebEnabled bool     `json:"need_web_enabled,omitempty"`
}

type RecipeQueryResult struct {
	Query   string       `json:"query"`
	Matches []RecipeCard `json:"matches"`
}

func NewWebSearchTool(search func(context.Context, string) (*SearchResult, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("web_search", "使用后端兜底网页检索补充最新结果。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("search query is empty")
		}
		result, err := search(ctx, query)
		if err != nil {
			return "", err
		}
		if result == nil {
			result = &SearchResult{}
		}
		result.Query = query
		return marshal(result)
	})
}

func NewKnowledgeLookupTool(lookup func(context.Context, string, int) ([]Source, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("knowledge_lookup", "查询当前家庭知识库中的相关资料。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("knowledge query is empty")
		}
		limit := input.Limit
		if limit <= 0 {
			limit = 4
		}
		results, err := lookup(ctx, query, limit)
		if err != nil {
			return "", err
		}
		return marshal(SearchResult{Query: query, Results: results})
	})
}

func NewRecipeQueryTool(query func(context.Context, string, int) ([]RecipeCard, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("recipe_query", "查询家庭菜谱库中的可用菜谱。", func(ctx context.Context, input QueryArgs) (string, error) {
		rawQuery := strings.TrimSpace(input.Query)
		if rawQuery == "" {
			return "", fmt.Errorf("recipe query is empty")
		}
		limit := input.Limit
		if limit <= 0 {
			limit = 5
		}
		matches, err := query(ctx, rawQuery, limit)
		if err != nil {
			return "", err
		}
		return marshal(RecipeQueryResult{Query: rawQuery, Matches: matches})
	})
}
