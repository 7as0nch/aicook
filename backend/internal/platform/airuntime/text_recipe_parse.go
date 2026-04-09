package airuntime

import airrecipe "github.com/chengjiang/aicook/backend/internal/platform/airuntime/recipe"

func parseTextRecipeDraftJSON(raw string) (*TextRecipeDraft, error) {
	draft, err := airrecipe.ParseTextDraftJSON(raw)
	if err != nil {
		return nil, err
	}
	return fromRecipeTextDraft(draft), nil
}

func toRecipeTextDraft(item *TextRecipeDraft) *airrecipe.TextDraft {
	if item == nil {
		return nil
	}
	ingredients := make([]airrecipe.DraftIngredient, 0, len(item.Ingredients))
	for _, ingredient := range item.Ingredients {
		ingredients = append(ingredients, airrecipe.DraftIngredient{
			GroupName:   ingredient.GroupName,
			Name:        ingredient.Name,
			AmountText:  ingredient.AmountText,
			Preparation: ingredient.Preparation,
		})
	}
	steps := make([]airrecipe.DraftStep, 0, len(item.Steps))
	for _, step := range item.Steps {
		steps = append(steps, airrecipe.DraftStep{
			Title:          step.Title,
			Description:    step.Description,
			StepType:       step.StepType,
			NeedTimer:      step.NeedTimer,
			TimerSeconds:   step.TimerSeconds,
			TimerAnimation: step.TimerAnimation,
			EndCondition:   step.EndCondition,
		})
	}
	return &airrecipe.TextDraft{
		Title:         item.Title,
		Summary:       item.Summary,
		Category:      item.Category,
		CoverImageURL: item.CoverImageURL,
		TotalMinutes:  item.TotalMinutes,
		Difficulty:    item.Difficulty,
		Tools:         append([]string(nil), item.Tools...),
		ScenarioTags:  append([]string(nil), item.ScenarioTags...),
		FlavorTags:    append([]string(nil), item.FlavorTags...),
		Ingredients:   ingredients,
		Steps:         steps,
	}
}

func fromRecipeTextDraft(item *airrecipe.TextDraft) *TextRecipeDraft {
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
	return &TextRecipeDraft{
		Title:         item.Title,
		Summary:       item.Summary,
		Category:      item.Category,
		CoverImageURL: item.CoverImageURL,
		TotalMinutes:  item.TotalMinutes,
		Difficulty:    item.Difficulty,
		Tools:         append([]string(nil), item.Tools...),
		ScenarioTags:  append([]string(nil), item.ScenarioTags...),
		FlavorTags:    append([]string(nil), item.FlavorTags...),
		Ingredients:   ingredients,
		Steps:         steps,
	}
}
