package airuntime

import (
	"context"
	"strings"

	graphruntime "github.com/chengjiang/aicook/backend/internal/platform/airuntime/graph"
)

func (r *Runtime) runImageRecipeGraph(ctx context.Context, req ReplyRequest, titleHint string, bridge *streamBridge) (*RecipeCard, error) {
	if r.imageRecipeCreator == nil {
		return nil, nil
	}
	inputText := strings.TrimSpace(titleHint)
	if inputText == "" {
		inputText = strings.TrimSpace(req.Text)
	}
	output, err := graphruntime.RunImageRecipe(ctx, graphruntime.ImageRecipeConfig{
		Text:     inputText,
		HasImage: hasImageAttachments(req.Attachments),
		Create: func(ctx context.Context, text string) (*graphruntime.RecipeCard, error) {
			card, err := r.imageRecipeCreator.CreateImageRecipeCardForAI(ctx, req.HouseholdID, req.UserID, req.Attachments, text)
			if err != nil {
				return nil, err
			}
			return toGraphRecipeCard(card), nil
		},
	}, graphruntime.WithStepObserver(func(_ context.Context, step graphruntime.Step) {
		if bridge == nil {
			return
		}
		_ = bridge.emitWorkflow(WorkflowStep{
			ID:     step.ID,
			Title:  graphruntime.LocalizeStepTitle(step.Title),
			Status: step.Status,
			Detail: graphruntime.LocalizeStepDetail(step.Detail),
		})
	}))
	if err != nil {
		return nil, err
	}
	if bridge != nil && strings.TrimSpace(output.Content) != "" {
		bridge.reply.Content = strings.TrimSpace(output.Content)
	}
	return fromGraphRecipeCard(output.Card), nil
}

type textRecipeGraphOutput struct {
	Status  string
	Summary string
	Card    *RecipeCard
	Sources []Source
}

func (r *Runtime) runTextRecipeGraph(ctx context.Context, req ReplyRequest, query string, preferences TextRecipePreferences, seedCoverImageURL string, bridge *streamBridge) (*textRecipeGraphOutput, error) {
	output, err := graphruntime.RunTextRecipe(ctx, graphruntime.TextRecipeRequest{
		Query:            strings.TrimSpace(query),
		WebSearchEnabled: req.WebSearchEnabled,
		Preferences: graphruntime.TextRecipePreferences{
			Flavor:     preferences.Flavor,
			Duration:   preferences.Duration,
			Difficulty: preferences.Difficulty,
			Style:      preferences.Style,
			Constraints: append([]string(nil), preferences.Constraints...),
		},
		SeedCoverImageURL: strings.TrimSpace(seedCoverImageURL),
	}, graphruntime.TextRecipeCallbacks{
		LookupKnowledge: func(ctx context.Context, question string, limit int) ([]graphruntime.Source, error) {
			if r.knowledgeLookup == nil {
				return nil, nil
			}
			results, err := r.knowledgeLookup.LookupKnowledgeSources(ctx, req.HouseholdID, question, limit)
			if err != nil {
				return nil, err
			}
			return toGraphSources(results), nil
		},
		QueryRecipes: func(ctx context.Context, question string, limit int) ([]graphruntime.Source, error) {
			if r.recipeLookup == nil {
				return nil, nil
			}
			results, err := r.recipeLookup.SearchRecipesForAI(ctx, req.HouseholdID, question, limit)
			if err != nil {
				return nil, err
			}
			return recipeCardsToGraphSources(results), nil
		},
		SearchWeb: func(ctx context.Context, question string) ([]graphruntime.Source, error) {
			output, err := r.runWebSearchGraph(ctx, req, question+" 做法 菜谱", nil)
			if err != nil {
				return nil, err
			}
			if output == nil {
				return nil, nil
			}
			return output.Results, nil
		},
		GenerateDraft: func(ctx context.Context, input graphruntime.TextRecipeRequest, sources []graphruntime.Source) (*graphruntime.TextRecipeDraft, error) {
			draft, err := r.generateTextRecipeDraft(ctx, input.Query, fromGraphSources(sources), TextRecipePreferences{
				Flavor:     input.Preferences.Flavor,
				Duration:   input.Preferences.Duration,
				Difficulty: input.Preferences.Difficulty,
				Style:      input.Preferences.Style,
				Constraints: append([]string(nil), input.Preferences.Constraints...),
			})
			if err != nil {
				return nil, err
			}
			return toGraphTextRecipeDraft(draft), nil
		},
		NormalizeDraft: func(input graphruntime.TextRecipeRequest, draft *graphruntime.TextRecipeDraft) (*graphruntime.TextRecipeDraft, error) {
			normalized, err := normalizeTextRecipeDraft(input.Query, fromGraphTextRecipeDraft(draft), TextRecipePreferences{
				Flavor:     input.Preferences.Flavor,
				Duration:   input.Preferences.Duration,
				Difficulty: input.Preferences.Difficulty,
				Style:      input.Preferences.Style,
				Constraints: append([]string(nil), input.Preferences.Constraints...),
			}, input.SeedCoverImageURL)
			if err != nil {
				return nil, err
			}
			return toGraphTextRecipeDraft(normalized), nil
		},
	}, graphruntime.WithStepObserver(func(_ context.Context, step graphruntime.Step) {
		if bridge == nil {
			return
		}
		_ = bridge.emitWorkflow(WorkflowStep{
			ID:     step.ID,
			Title:  graphruntime.LocalizeStepTitle(step.Title),
			Status: step.Status,
			Detail: graphruntime.LocalizeStepDetail(step.Detail),
		})
	}))
	if err != nil {
		return nil, err
	}
	return &textRecipeGraphOutput{
		Status:  output.Status,
		Summary: output.Summary,
		Card:    fromGraphRecipeCard(output.Card),
		Sources: fromGraphSources(output.Sources),
	}, nil
}

func toGraphRecipeCard(card *RecipeCard) *graphruntime.RecipeCard {
	if card == nil {
		return nil
	}
	return &graphruntime.RecipeCard{
		RecipeID:     card.RecipeID,
		Title:        card.Title,
		Summary:      card.Summary,
		CoverImageURL: card.CoverImageURL,
		Ingredients:  append([]string(nil), card.Ingredients...),
		Time:         card.Time,
		Difficulty:   card.Difficulty,
		Status:       card.Status,
		Source:       card.Source,
		IsRecipe:     card.IsRecipe,
		RejectReason: card.RejectReason,
		Draft:        toGraphTextRecipeDraft(card.Draft),
	}
}

func fromGraphRecipeCard(card *graphruntime.RecipeCard) *RecipeCard {
	if card == nil {
		return nil
	}
	return &RecipeCard{
		RecipeID:     card.RecipeID,
		Title:        card.Title,
		Summary:      card.Summary,
		CoverImageURL: card.CoverImageURL,
		Ingredients:  append([]string(nil), card.Ingredients...),
		Time:         card.Time,
		Difficulty:   card.Difficulty,
		Status:       card.Status,
		Source:       card.Source,
		IsRecipe:     card.IsRecipe,
		RejectReason: card.RejectReason,
		Draft:        fromGraphTextRecipeDraft(card.Draft),
	}
}

func toGraphSources(items []Source) []graphruntime.Source {
	results := make([]graphruntime.Source, 0, len(items))
	for _, item := range items {
		results = append(results, graphruntime.Source{
			Title:      item.Title,
			DocumentID: item.DocumentID,
			Snippet:    item.Snippet,
			SourceKind: item.SourceKind,
			SiteName:   item.SiteName,
			PublishTime: item.PublishTime,
			LogoURL:    item.LogoURL,
		})
	}
	return results
}

func fromGraphSources(items []graphruntime.Source) []Source {
	results := make([]Source, 0, len(items))
	for _, item := range items {
		results = append(results, Source{
			Title:      item.Title,
			DocumentID: item.DocumentID,
			Snippet:    item.Snippet,
			SourceKind: item.SourceKind,
			SiteName:   item.SiteName,
			PublishTime: item.PublishTime,
			LogoURL:    item.LogoURL,
		})
	}
	return results
}

func recipeCardsToGraphSources(items []RecipeCard) []graphruntime.Source {
	results := make([]graphruntime.Source, 0, len(items))
	for _, item := range items {
		snippetParts := make([]string, 0, 3)
		if strings.TrimSpace(item.Summary) != "" {
			snippetParts = append(snippetParts, strings.TrimSpace(item.Summary))
		}
		if strings.TrimSpace(item.Time) != "" {
			snippetParts = append(snippetParts, "时长："+strings.TrimSpace(item.Time))
		}
		if strings.TrimSpace(item.Difficulty) != "" {
			snippetParts = append(snippetParts, "难度："+strings.TrimSpace(item.Difficulty))
		}
		results = append(results, graphruntime.Source{
			Title:      item.Title,
			DocumentID: strings.TrimSpace(item.RecipeID),
			Snippet:    strings.Join(snippetParts, "；"),
			SourceKind: "recipe_query",
		})
	}
	return results
}

func toGraphTextRecipeDraft(draft *TextRecipeDraft) *graphruntime.TextRecipeDraft {
	if draft == nil {
		return nil
	}
	ingredients := make([]graphruntime.DraftIngredient, 0, len(draft.Ingredients))
	for _, item := range draft.Ingredients {
		ingredients = append(ingredients, graphruntime.DraftIngredient{
			GroupName:   item.GroupName,
			Name:        item.Name,
			AmountText:  item.AmountText,
			Preparation: item.Preparation,
		})
	}
	steps := make([]graphruntime.DraftStep, 0, len(draft.Steps))
	for _, item := range draft.Steps {
		steps = append(steps, graphruntime.DraftStep{
			Title:          item.Title,
			Description:    item.Description,
			StepType:       item.StepType,
			NeedTimer:      item.NeedTimer,
			TimerSeconds:   item.TimerSeconds,
			TimerAnimation: item.TimerAnimation,
			EndCondition:   item.EndCondition,
		})
	}
	return &graphruntime.TextRecipeDraft{
		Title:         draft.Title,
		Summary:       draft.Summary,
		Category:      draft.Category,
		CoverImageURL: draft.CoverImageURL,
		TotalMinutes:  draft.TotalMinutes,
		Difficulty:    draft.Difficulty,
		Tools:         append([]string(nil), draft.Tools...),
		ScenarioTags:  append([]string(nil), draft.ScenarioTags...),
		FlavorTags:    append([]string(nil), draft.FlavorTags...),
		Ingredients:   ingredients,
		Steps:         steps,
	}
}

func fromGraphTextRecipeDraft(draft *graphruntime.TextRecipeDraft) *TextRecipeDraft {
	if draft == nil {
		return nil
	}
	ingredients := make([]DraftIngredient, 0, len(draft.Ingredients))
	for _, item := range draft.Ingredients {
		ingredients = append(ingredients, DraftIngredient{
			GroupName:   item.GroupName,
			Name:        item.Name,
			AmountText:  item.AmountText,
			Preparation: item.Preparation,
		})
	}
	steps := make([]DraftStep, 0, len(draft.Steps))
	for _, item := range draft.Steps {
		steps = append(steps, DraftStep{
			Title:          item.Title,
			Description:    item.Description,
			StepType:       item.StepType,
			NeedTimer:      item.NeedTimer,
			TimerSeconds:   item.TimerSeconds,
			TimerAnimation: item.TimerAnimation,
			EndCondition:   item.EndCondition,
		})
	}
	return &TextRecipeDraft{
		Title:         draft.Title,
		Summary:       draft.Summary,
		Category:      draft.Category,
		CoverImageURL: draft.CoverImageURL,
		TotalMinutes:  draft.TotalMinutes,
		Difficulty:    draft.Difficulty,
		Tools:         append([]string(nil), draft.Tools...),
		ScenarioTags:  append([]string(nil), draft.ScenarioTags...),
		FlavorTags:    append([]string(nil), draft.FlavorTags...),
		Ingredients:   ingredients,
		Steps:         steps,
	}
}
