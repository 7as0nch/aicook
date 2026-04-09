package airtool

import (
	"context"
	"fmt"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
)

type RecommendResult struct {
	Status    string          `json:"status"`
	Selection *ApprovalOption `json:"selection,omitempty"`
	Card      *RecipeCard     `json:"card,omitempty"`
	Summary   string          `json:"summary,omitempty"`
}

type recipeRecommendState struct {
	Prompt  string           `json:"prompt"`
	Options []ApprovalOption `json:"options"`
}

func NewRecipeRecommendTool(search func(context.Context, string, int) ([]RecipeCard, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("recipe_recommend", "根据用户想做的菜或口味偏好，给出候选菜谱并等待用户确认。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("recommend query is empty")
		}

		wasInterrupted, hasState, state := einotool.GetInterruptState[*recipeRecommendState](ctx)
		if !wasInterrupted {
			limit := input.Limit
			if limit <= 0 {
				limit = 4
			}
			matches, err := search(ctx, query, limit)
			if err != nil {
				return "", err
			}
			if len(matches) == 0 {
				return marshal(RecommendResult{
					Status:  "empty",
					Summary: "没有找到合适的候选菜谱，请换一种口味或菜名试试。",
				})
			}

			options := make([]ApprovalOption, 0, len(matches))
			for idx, item := range matches {
				optionID := item.RecipeID
				if optionID == "" {
					optionID = fmt.Sprintf("recipe_%d", idx+1)
				}
				card := item
				options = append(options, ApprovalOption{
					ID:         optionID,
					Title:      item.Title,
					Summary:    item.Summary,
					RecipeCard: &card,
				})
			}
			state := &recipeRecommendState{
				Prompt:  fmt.Sprintf("我先帮你筛了 %d 个更贴近需求的菜谱，选一个我继续整理成确认卡片。", len(options)),
				Options: options,
			}
			return "", einotool.StatefulInterrupt(ctx, &ApprovalInterrupt{
				Kind:    "recipe_recommend",
				Prompt:  state.Prompt,
				Options: state.Options,
			}, state)
		}

		if !hasState || state == nil {
			return "", fmt.Errorf("approval state is missing")
		}
		isTarget, hasData, data := einotool.GetResumeContext[*ApprovalResult](ctx)
		if !isTarget {
			return "", einotool.StatefulInterrupt(ctx, &ApprovalInterrupt{
				Kind:    "recipe_recommend",
				Prompt:  state.Prompt,
				Options: state.Options,
			}, state)
		}
		if !hasData || data == nil || !data.Approved {
			return marshal(RecommendResult{
				Status:  "cancelled",
				Summary: "这次先不继续推荐，告诉我新的口味或菜名我再帮你找。",
			})
		}

		for _, option := range state.Options {
			if option.ID != data.OptionID {
				continue
			}
			return marshal(RecommendResult{
				Status:    "selected",
				Selection: &option,
				Card:      option.RecipeCard,
				Summary:   fmt.Sprintf("已选择「%s」，我继续整理成确认卡片。", option.Title),
			})
		}

		return marshal(RecommendResult{
			Status:  "cancelled",
			Summary: "没有找到对应候选，请重新选择一次。",
		})
	})
}
