package airuntime

import (
	"context"
	"fmt"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"

	airrecipe "github.com/chengjiang/aicook/backend/internal/platform/airuntime/recipe"
)

func (r *Runtime) generateTextRecipeDraft(ctx context.Context, query string, sources []Source, preferences TextRecipePreferences) (*TextRecipeDraft, error) {
	model, _, err := r.selectChatModel(false)
	if err != nil {
		return nil, err
	}
	message, err := r.generateMessage(ctx, model, buildTextRecipeDraftMessages(query, sources, preferences), append(r.buildCallOptionsFromContext(ctx), einomodel.WithTemperature(0.3))...)
	if err != nil {
		return nil, err
	}
	if message == nil {
		return nil, fmt.Errorf("text recipe draft response is empty")
	}
	return parseTextRecipeDraftJSON(message.Content)
}

func buildTextRecipeDraftMessages(query string, sources []Source, preferences TextRecipePreferences) []*schema.Message {
	recipeSources := make([]airrecipe.Source, 0, len(sources))
	for _, item := range sources {
		recipeSources = append(recipeSources, airrecipe.Source{
			Title:   item.Title,
			Snippet: item.Snippet,
		})
	}
	prompt := airrecipe.BuildTextDraftPrompt(query, recipeSources, airrecipe.TextPreferences{
		Flavor:     preferences.Flavor,
		Duration:   preferences.Duration,
		Difficulty: preferences.Difficulty,
		Style:      preferences.Style,
		Constraints: append([]string(nil), preferences.Constraints...),
	})

	return []*schema.Message{
		{
			Role:    schema.System,
			Content: "你是 AICook 的菜谱结构化助手，只输出合法 JSON，不要补充任何解释。",
		},
		{
			Role:    schema.User,
			Content: prompt,
		},
	}
}
