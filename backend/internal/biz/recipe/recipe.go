package recipe

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"gorm.io/datatypes"
)

type RecipeRepo interface {
	ListLatest(ctx context.Context, householdID int64, limit int, keyword, kitchenTag string, excludeDraft bool, recipeStatus string) ([]*data.Recipe, error)
	GetDetail(ctx context.Context, householdID, recipeID int64) (*data.RecipeDetail, error)
	CreateDraft(ctx context.Context, recipe *data.Recipe, ingredients []*data.RecipeIngredient, steps []*data.RecipeStep) error
	UpdateRecipe(ctx context.Context, householdID int64, recipe *data.Recipe, ingredients []*data.RecipeIngredient, steps []*data.RecipeStep) error
	DeleteRecipe(ctx context.Context, householdID, recipeID int64) error
}

type RecipeUsecase struct {
	repo RecipeRepo
}

type CreateRecipeDraftRequest struct {
	HouseholdID   int64
	UserID        int64
	Title         string
	Summary       string
	CoverImageURL string
	Category      string
	TotalMinutes  int
	Difficulty    int
	Tools         []string
	ScenarioTags  []string
	FlavorTags       []string
	GalleryImageURLs []string
	Ingredients      []airuntime.DraftIngredient
	Steps            []airuntime.DraftStep
}

type UpdateRecipeRequest struct {
	HouseholdID      int64
	RecipeID         int64
	Title            string
	Summary          string
	CoverImageURL    string
	GalleryImageURLs []string
	Category         string
	Status           string
	TotalMinutes     int
	Difficulty       int
	Tools            []string
	ScenarioTags     []string
	FlavorTags       []string
	MetadataJSON     map[string]any
	Ingredients      []airuntime.DraftIngredient
	Steps            []airuntime.DraftStep
}

func NewRecipeUsecase(repo *data.RecipeRepo, aiRuntime *airuntime.Runtime) *RecipeUsecase {
	usecase := &RecipeUsecase{repo: repo}
	if aiRuntime != nil {
		aiRuntime.RegisterRecipeLookup(usecase)
	}
	return usecase
}

// stripPresignedQuery 去掉 S3/MinIO 预签名查询串，便于在数据库中保存稳定的对象 URL（私有桶直链 + API 读时再签）。
func stripPresignedQuery(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if u.Query().Get("X-Amz-Algorithm") == "" {
		return raw
	}
	u.RawQuery = ""
	u.Fragment = ""
	return strings.TrimSpace(u.String())
}

func canonicalizeGalleryImageURLs(urls []string) []string {
	if len(urls) == 0 {
		return urls
	}
	out := make([]string, 0, len(urls))
	for _, item := range urls {
		if c := stripPresignedQuery(item); c != "" {
			out = append(out, c)
		}
	}
	return out
}

func (u *RecipeUsecase) ListLatest(ctx context.Context, householdID int64, limit int, keyword, kitchenTag string, excludeDraft bool, recipeStatus string) ([]*data.Recipe, error) {
	if limit <= 0 {
		limit = 12
	}
	return u.repo.ListLatest(ctx, householdID, limit, keyword, kitchenTag, excludeDraft, recipeStatus)
}

func (u *RecipeUsecase) GetDetail(ctx context.Context, householdID, recipeID int64) (*data.RecipeDetail, error) {
	return u.repo.GetDetail(ctx, householdID, recipeID)
}

func (u *RecipeUsecase) UpdateRecipe(ctx context.Context, req UpdateRecipeRequest) (*data.RecipeDetail, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return nil, fmt.Errorf("recipe title is required")
	}
	if req.RecipeID <= 0 {
		return nil, fmt.Errorf("recipe id is required")
	}
	status := strings.TrimSpace(strings.ToLower(req.Status))
	if status == "" {
		status = "draft"
	}
	if status != "draft" && status != "published" {
		return nil, fmt.Errorf("invalid recipe status")
	}
	ingredients := make([]*data.RecipeIngredient, 0, len(req.Ingredients))
	for idx, item := range req.Ingredients {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		ingredients = append(ingredients, &data.RecipeIngredient{
			SortOrder:   idx + 1,
			GroupName:   strings.TrimSpace(item.GroupName),
			Name:        name,
			AmountText:  strings.TrimSpace(item.AmountText),
			Preparation: strings.TrimSpace(item.Preparation),
		})
	}
	if len(ingredients) == 0 {
		return nil, fmt.Errorf("recipe ingredients are required")
	}
	steps := make([]*data.RecipeStep, 0, len(req.Steps))
	for idx, item := range req.Steps {
		description := strings.TrimSpace(item.Description)
		if description == "" {
			continue
		}
		stepURLs := append([]string(nil), item.MediaURLs...)
		for i := range stepURLs {
			stepURLs[i] = stripPresignedQuery(stepURLs[i])
		}
		firstMedia, mediaJSON := data.StepMediaStorage(stripPresignedQuery(item.MediaURL), stepURLs)
		steps = append(steps, &data.RecipeStep{
			StepNo:         idx + 1,
			Title:          strings.TrimSpace(item.Title),
			Description:    description,
			StepType:       fallbackDraftStepType(strings.TrimSpace(item.StepType)),
			NeedTimer:      item.NeedTimer || item.TimerSeconds > 0,
			TimerSeconds:   maxDraftTimer(item.TimerSeconds, item.NeedTimer),
			TimerAnimation: fallbackDraftTimerAnimation(strings.TrimSpace(item.TimerAnimation), item.NeedTimer || item.TimerSeconds > 0),
			EndCondition:   strings.TrimSpace(item.EndCondition),
			MediaURL:       firstMedia,
			MediaURLs:      mediaJSON,
		})
	}
	if len(steps) == 0 {
		return nil, fmt.Errorf("recipe steps are required")
	}
	totalMinutes := req.TotalMinutes
	if totalMinutes <= 0 {
		for _, step := range steps {
			totalMinutes += step.TimerSeconds / 60
		}
		if totalMinutes <= 0 {
			totalMinutes = len(steps) * 5
		}
	}
	difficulty := req.Difficulty
	if difficulty <= 0 {
		difficulty = 2
	}
	if difficulty > 5 {
		difficulty = 5
	}
	toolsJSON, _ := json.Marshal(uniqueDraftStrings(req.Tools))
	scenarioJSON, _ := json.Marshal(uniqueDraftStrings(req.ScenarioTags))
	flavorJSON, _ := json.Marshal(uniqueDraftStrings(req.FlavorTags))
	meta := datatypes.JSONMap{}
	if req.MetadataJSON != nil {
		for k, v := range req.MetadataJSON {
			meta[k] = v
		}
	}
	recipe := &data.Recipe{
		Title:            title,
		Summary:          strings.TrimSpace(req.Summary),
		CoverImageURL:    stripPresignedQuery(req.CoverImageURL),
		GalleryImageURLs: data.GalleryImageURLsJSON(canonicalizeGalleryImageURLs(req.GalleryImageURLs)),
		Status:           status,
		Category:         strings.TrimSpace(req.Category),
		TotalMinutes:     totalMinutes,
		Difficulty:       difficulty,
		ScenarioTags:     datatypes.JSON(scenarioJSON),
		FlavorTags:       datatypes.JSON(flavorJSON),
		Tools:            datatypes.JSON(toolsJSON),
		MetadataJSON:     meta,
	}
	recipe.ID = req.RecipeID
	if recipe.Category == "" {
		recipe.Category = "家常菜"
	}
	if err := u.repo.UpdateRecipe(ctx, req.HouseholdID, recipe, ingredients, steps); err != nil {
		return nil, err
	}
	return u.repo.GetDetail(ctx, req.HouseholdID, req.RecipeID)
}

func (u *RecipeUsecase) DeleteRecipe(ctx context.Context, householdID, recipeID int64) error {
	if recipeID <= 0 {
		return fmt.Errorf("recipe id is required")
	}
	return u.repo.DeleteRecipe(ctx, householdID, recipeID)
}

func (u *RecipeUsecase) CreateDraft(ctx context.Context, req CreateRecipeDraftRequest) (*data.RecipeDetail, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return nil, fmt.Errorf("recipe title is required")
	}
	ingredients := make([]*data.RecipeIngredient, 0, len(req.Ingredients))
	for idx, item := range req.Ingredients {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		ingredients = append(ingredients, &data.RecipeIngredient{
			SortOrder:   idx + 1,
			GroupName:   strings.TrimSpace(item.GroupName),
			Name:        name,
			AmountText:  strings.TrimSpace(item.AmountText),
			Preparation: strings.TrimSpace(item.Preparation),
		})
	}
	if len(ingredients) == 0 {
		return nil, fmt.Errorf("recipe ingredients are required")
	}
	steps := make([]*data.RecipeStep, 0, len(req.Steps))
	for idx, item := range req.Steps {
		description := strings.TrimSpace(item.Description)
		if description == "" {
			continue
		}
		stepURLs := append([]string(nil), item.MediaURLs...)
		for i := range stepURLs {
			stepURLs[i] = stripPresignedQuery(stepURLs[i])
		}
		firstMedia, mediaJSON := data.StepMediaStorage(stripPresignedQuery(item.MediaURL), stepURLs)
		steps = append(steps, &data.RecipeStep{
			StepNo:         idx + 1,
			Title:          strings.TrimSpace(item.Title),
			Description:    description,
			StepType:       fallbackDraftStepType(strings.TrimSpace(item.StepType)),
			NeedTimer:      item.NeedTimer || item.TimerSeconds > 0,
			TimerSeconds:   maxDraftTimer(item.TimerSeconds, item.NeedTimer),
			TimerAnimation: fallbackDraftTimerAnimation(strings.TrimSpace(item.TimerAnimation), item.NeedTimer || item.TimerSeconds > 0),
			EndCondition:   strings.TrimSpace(item.EndCondition),
			MediaURL:       firstMedia,
			MediaURLs:      mediaJSON,
		})
	}
	if len(steps) == 0 {
		return nil, fmt.Errorf("recipe steps are required")
	}
	totalMinutes := req.TotalMinutes
	if totalMinutes <= 0 {
		for _, step := range steps {
			totalMinutes += step.TimerSeconds / 60
		}
		if totalMinutes <= 0 {
			totalMinutes = len(steps) * 5
		}
	}
	difficulty := req.Difficulty
	if difficulty <= 0 {
		difficulty = 2
	}
	if difficulty > 5 {
		difficulty = 5
	}
	toolsJSON, _ := json.Marshal(uniqueDraftStrings(req.Tools))
	scenarioJSON, _ := json.Marshal(uniqueDraftStrings(req.ScenarioTags))
	flavorJSON, _ := json.Marshal(uniqueDraftStrings(req.FlavorTags))
	recipe := &data.Recipe{
		HouseholdID:      req.HouseholdID,
		OwnerUserID:      req.UserID,
		Title:            title,
		Summary:          strings.TrimSpace(req.Summary),
		CoverImageURL:    stripPresignedQuery(req.CoverImageURL),
		GalleryImageURLs: data.GalleryImageURLsJSON(canonicalizeGalleryImageURLs(req.GalleryImageURLs)),
		Status:           "draft",
		SourceType:       "ai_text",
		Language:         "zh-CN",
		Category:         strings.TrimSpace(req.Category),
		TotalMinutes:     totalMinutes,
		Difficulty:       difficulty,
		ScenarioTags:     datatypes.JSON(scenarioJSON),
		FlavorTags:       datatypes.JSON(flavorJSON),
		Tools:            datatypes.JSON(toolsJSON),
	}
	if recipe.Category == "" {
		recipe.Category = "家常菜"
	}
	if err := u.repo.CreateDraft(ctx, recipe, ingredients, steps); err != nil {
		return nil, err
	}
	return &data.RecipeDetail{
		Recipe:      recipe,
		Ingredients: ingredients,
		Steps:       steps,
	}, nil
}

func (u *RecipeUsecase) SearchRecipesForAI(ctx context.Context, householdID int64, query string, limit int) ([]airuntime.RecipeCard, error) {
	items, err := u.repo.ListLatest(ctx, householdID, limit, strings.TrimSpace(query), "", false, "")
	if err != nil {
		return nil, err
	}
	cards := make([]airuntime.RecipeCard, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		cards = append(cards, airuntime.RecipeCard{
			RecipeID:    fmt.Sprintf("%d", item.ID),
			Title:       item.Title,
			Summary:     item.Summary,
			CoverImageURL: strings.TrimSpace(item.CoverImageURL),
			Time:        formatRecipeMinutes(item.TotalMinutes),
			Difficulty:  formatRecipeDifficulty(item.Difficulty),
			Status:      item.Status,
			Source:      "recipe_library",
			IsRecipe:    true,
			Ingredients: nil,
		})
	}
	return cards, nil
}

func formatRecipeMinutes(minutes int) string {
	if minutes <= 0 {
		return "时长待确认"
	}
	return fmt.Sprintf("%d 分钟", minutes)
}

func formatRecipeDifficulty(level int) string {
	if level <= 0 {
		return "待确认"
	}
	if level > 5 {
		level = 5
	}
	return fmt.Sprintf("%s %d", strings.Repeat("★", level), level)
}

func uniqueDraftStrings(items []string) []string {
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

func fallbackDraftStepType(stepType string) string {
	if stepType == "" {
		return "cook"
	}
	return stepType
}

func fallbackDraftTimerAnimation(animation string, needTimer bool) string {
	if !needTimer {
		return ""
	}
	if animation == "" {
		return "ring"
	}
	return animation
}

func maxDraftTimer(timerSeconds int, needTimer bool) int {
	if timerSeconds > 0 {
		return timerSeconds
	}
	if needTimer {
		return 300
	}
	return 0
}
