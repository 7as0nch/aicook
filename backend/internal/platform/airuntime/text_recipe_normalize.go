package airuntime

import airrecipe "github.com/chengjiang/aicook/backend/internal/platform/airuntime/recipe"

func normalizeTextRecipeDraft(query string, draft *TextRecipeDraft, preferences TextRecipePreferences, seedCoverImageURL string) (*TextRecipeDraft, error) {
	normalized, err := airrecipe.NormalizeTextDraft(query, toRecipeTextDraft(draft), airrecipe.TextPreferences{
		Flavor:     preferences.Flavor,
		Duration:   preferences.Duration,
		Difficulty: preferences.Difficulty,
		Style:      preferences.Style,
	}, seedCoverImageURL)
	if err != nil {
		return nil, err
	}
	return fromRecipeTextDraft(normalized), nil
}
