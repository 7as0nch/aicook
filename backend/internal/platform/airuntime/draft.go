package airuntime

import (
	"context"
	"fmt"
	"strings"

	einomodel "github.com/cloudwego/eino/components/model"
	einoopenai "github.com/cloudwego/eino-ext/components/model/openai"

	airrecipe "github.com/chengjiang/aicook/backend/internal/platform/airuntime/recipe"
)

func (r *Runtime) GenerateImageRecipeDraft(ctx context.Context, input ImageRecipeDraftInput) (*ImageRecipeDraft, string, error) {
	var multimodalErr error
	if len(input.Images) > 0 && r.multimodalModel != nil {
		draft, err := r.generateImageDraftWithModel(ctx, r.multimodalModel, input)
		if err == nil {
			return draft, "multimodal", nil
		}
		multimodalErr = err
	}

	if strings.TrimSpace(input.OCRText) != "" {
		model := r.textModel
		if model == nil {
			model = r.multimodalModel
		}
		if model != nil {
			draft, err := r.generateImageDraftWithModel(ctx, model, input)
			if err == nil {
				return draft, "ocr_fallback", nil
			}
		}
		return heuristicDraft(input), "heuristic", nil
	}

	if multimodalErr != nil {
		return nil, "", multimodalErr
	}
	return heuristicDraft(input), "heuristic", nil
}

func (r *Runtime) generateImageDraftWithModel(ctx context.Context, model *einoopenai.ChatModel, input ImageRecipeDraftInput) (*ImageRecipeDraft, error) {
	if model == nil {
		return nil, fmt.Errorf("image draft model is not configured")
	}
	// 图片由后端拉取并 base64 内联（MiMo 云端拉不到内网 http MinIO URL → 400 Param Incorrect）
	imageParts, err := r.resolveImageDraftParts(ctx, input.Images)
	if err != nil {
		return nil, err
	}
	msg, err := r.generateMessage(ctx, model, buildImageDraftMessages(r.mode, input, imageParts), einomodel.WithTemperature(0.2))
	if err != nil {
		return nil, err
	}
	if msg == nil {
		return nil, fmt.Errorf("image draft response is empty")
	}
	return parseDraftJSON(msg.Content)
}

func parseDraftJSON(raw string) (*ImageRecipeDraft, error) {
	draft, err := airrecipe.ParseImageDraftJSON(raw)
	if err != nil {
		return nil, err
	}
	return fromRecipeImageDraft(draft), nil
}

func heuristicDraft(input ImageRecipeDraftInput) *ImageRecipeDraft {
	draft := airrecipe.HeuristicImageDraft(airrecipe.ImageDraftInput{
		TitleHint: input.TitleHint,
		OCRText:   input.OCRText,
	})
	return fromRecipeImageDraft(draft)
}

func fromRecipeImageDraft(item *airrecipe.ImageDraft) *ImageRecipeDraft {
	if item == nil {
		return nil
	}
	ingredients := make([]DraftIngredient, 0, len(item.Ingredients))
	for _, ingredient := range item.Ingredients {
		ingredients = append(ingredients, DraftIngredient{
			GroupName:   ingredient.GroupName,
			Name:        ingredient.Name,
			AmountText:  ingredient.AmountText,
			Preparation: ingredient.Preparation,
		})
	}
	steps := make([]DraftStep, 0, len(item.Steps))
	for _, step := range item.Steps {
		steps = append(steps, DraftStep{
			Title:          step.Title,
			Description:    step.Description,
			StepType:       step.StepType,
			NeedTimer:      step.NeedTimer,
			TimerSeconds:   step.TimerSeconds,
			TimerAnimation: step.TimerAnimation,
			EndCondition:   step.EndCondition,
		})
	}
	return &ImageRecipeDraft{
		Title:        item.Title,
		Summary:      item.Summary,
		Category:     item.Category,
		TotalMinutes: item.TotalMinutes,
		Difficulty:   item.Difficulty,
		Tools:        append([]string(nil), item.Tools...),
		Ingredients:  ingredients,
		Steps:        steps,
	}
}
