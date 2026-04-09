package airuntime

import "strings"

var recipeGenerationIntentHints = []string{
	"生成菜谱",
	"生成食谱",
	"给我菜谱",
	"给我食谱",
	"给我做法",
	"帮我做",
	"怎么做",
	"做法",
	"菜谱",
	"食谱",
	"配方",
	"教程",
	"步骤",
	"想做",
	"我要做",
}

var recipeQueryIntentHints = []string{
	"查菜谱",
	"搜菜谱",
	"有没有",
	"现有菜谱",
	"库里",
}

func isRecipeGenerationIntent(req ReplyRequest) bool {
	text := strings.ToLower(strings.TrimSpace(req.Text))
	if text == "" {
		return false
	}
	if req.ApprovalResponse != nil {
		return true
	}
	for _, hint := range recipeQueryIntentHints {
		if strings.Contains(text, strings.ToLower(hint)) {
			return false
		}
	}
	for _, hint := range recipeGenerationIntentHints {
		if strings.Contains(text, strings.ToLower(hint)) {
			return true
		}
	}
	return false
}

func filterSearchResultSources(items []Source) []Source {
	if len(items) == 0 {
		return nil
	}
	results := make([]Source, 0, len(items))
	for _, item := range items {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(item.DocumentID)), "http") {
			results = append(results, item)
			continue
		}
		if strings.TrimSpace(item.SiteName) != "" || strings.TrimSpace(item.LogoURL) != "" || strings.TrimSpace(item.PublishTime) != "" {
			results = append(results, item)
		}
	}
	return dedupeSources(results)
}
