package airuntime

import (
	"fmt"
	"strings"
)

func normalizeTextRecipeDraft(query string, draft *TextRecipeDraft, preferences TextRecipePreferences, seedCoverImageURL string) (*TextRecipeDraft, error) {
	if draft == nil {
		return nil, fmt.Errorf("text recipe draft is empty")
	}
	normalized := *draft
	normalized.Title = strings.TrimSpace(normalized.Title)
	if normalized.Title == "" {
		normalized.Title = strings.TrimSpace(query)
	}
	if normalized.Title == "" {
		return nil, fmt.Errorf("recipe title is empty")
	}
	normalized.Summary = strings.TrimSpace(normalized.Summary)
	if normalized.Summary == "" {
		normalized.Summary = fmt.Sprintf("%s的家常做法，已整理成可直接执行的步骤。", normalized.Title)
	}
	normalized.Category = strings.TrimSpace(normalized.Category)
	if normalized.Category == "" {
		normalized.Category = "家常菜"
	}
	normalized.CoverImageURL = strings.TrimSpace(normalized.CoverImageURL)
	if normalized.CoverImageURL == "" {
		normalized.CoverImageURL = strings.TrimSpace(seedCoverImageURL)
	}
	if normalized.Difficulty <= 0 {
		normalized.Difficulty = mapPreferenceDifficulty(preferences.Difficulty)
	}
	if normalized.Difficulty > 5 {
		normalized.Difficulty = 5
	}
	normalized.Tools = uniqueTrimmedStrings(normalized.Tools)
	normalized.ScenarioTags = uniqueTrimmedStrings(normalized.ScenarioTags)
	normalized.FlavorTags = uniqueTrimmedStrings(normalized.FlavorTags)
	if flavor := strings.TrimSpace(preferences.Flavor); flavor != "" && !containsString(normalized.FlavorTags, flavor) {
		normalized.FlavorTags = append([]string{flavor}, normalized.FlavorTags...)
	}
	if style := strings.TrimSpace(preferences.Style); style != "" && !containsString(normalized.ScenarioTags, style) {
		normalized.ScenarioTags = append([]string{style}, normalized.ScenarioTags...)
	}

	ingredients := make([]DraftIngredient, 0, len(normalized.Ingredients))
	for _, item := range normalized.Ingredients {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		ingredients = append(ingredients, DraftIngredient{
			GroupName:   strings.TrimSpace(item.GroupName),
			Name:        name,
			AmountText:  strings.TrimSpace(item.AmountText),
			Preparation: strings.TrimSpace(item.Preparation),
		})
	}
	if len(ingredients) == 0 {
		return nil, fmt.Errorf("recipe ingredients are empty")
	}
	normalized.Ingredients = ingredients

	steps := make([]DraftStep, 0, len(normalized.Steps))
	totalSeconds := 0
	for idx, item := range normalized.Steps {
		description := strings.TrimSpace(item.Description)
		if description == "" {
			continue
		}
		timerSeconds := item.TimerSeconds
		if timerSeconds <= 0 {
			timerSeconds = extractTimer(description)
		}
		needTimer := item.NeedTimer || timerSeconds > 0
		if needTimer && timerSeconds <= 0 {
			timerSeconds = 300
		}
		if timerSeconds > 0 {
			totalSeconds += timerSeconds
		}
		steps = append(steps, DraftStep{
			Title:          fallbackStepTitle(strings.TrimSpace(item.Title), idx+1),
			Description:    description,
			StepType:       fallbackStepType(strings.TrimSpace(item.StepType)),
			NeedTimer:      needTimer,
			TimerSeconds:   timerSeconds,
			TimerAnimation: fallbackTimerAnimation(strings.TrimSpace(item.TimerAnimation), needTimer),
			EndCondition:   strings.TrimSpace(item.EndCondition),
		})
	}
	if len(steps) == 0 {
		return nil, fmt.Errorf("recipe steps are empty")
	}
	normalized.Steps = steps

	if normalized.TotalMinutes <= 0 {
		if totalSeconds > 0 {
			normalized.TotalMinutes = maxInt(10, totalSeconds/60)
		} else {
			normalized.TotalMinutes = maxInt(15, len(steps)*5)
		}
	}
	normalized.TotalMinutes = applyDurationPreference(normalized.TotalMinutes, preferences.Duration)
	return &normalized, nil
}

func fallbackStepTitle(title string, idx int) string {
	if title != "" {
		return title
	}
	return fmt.Sprintf("步骤 %d", idx)
}

func fallbackStepType(stepType string) string {
	if stepType == "" {
		return "cook"
	}
	return stepType
}

func fallbackTimerAnimation(animation string, needTimer bool) string {
	if !needTimer {
		return ""
	}
	if animation == "" {
		return "ring"
	}
	return animation
}

func uniqueTrimmedStrings(items []string) []string {
	result := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func mapPreferenceDifficulty(value string) int {
	switch strings.TrimSpace(value) {
	case "简单":
		return 1
	case "中等":
		return 2
	case "进阶":
		return 4
	default:
		return 2
	}
}

func applyDurationPreference(minutes int, preference string) int {
	switch strings.TrimSpace(preference) {
	case "20 分钟内":
		if minutes <= 0 || minutes > 20 {
			return 20
		}
	case "40 分钟内":
		if minutes <= 0 || minutes > 40 {
			return 40
		}
	case "1 小时左右":
		if minutes <= 0 || minutes > 60 {
			return 60
		}
	}
	return minutes
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if strings.TrimSpace(item) == target {
			return true
		}
	}
	return false
}
