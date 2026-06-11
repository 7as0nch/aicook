package data

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type RecipeDetail struct {
	Recipe      *Recipe
	Ingredients []*RecipeIngredient
	Steps       []*RecipeStep
}

type RecipeRepo struct {
	db *gorm.DB
}

func NewRecipeRepo(db *gorm.DB) *RecipeRepo {
	return &RecipeRepo{db: db}
}

const (
	recipeKitchenRelationPrimary   = "primary"
	recipeKitchenRelationSecondary = "secondary"
)

func (r *RecipeRepo) CreateDraft(ctx context.Context, recipe *Recipe, ingredients []*RecipeIngredient, steps []*RecipeStep) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(recipe).Error; err != nil {
			return err
		}
		for _, ingredient := range ingredients {
			ingredient.RecipeID = recipe.ID
		}
		for _, step := range steps {
			step.RecipeID = recipe.ID
		}
		if len(ingredients) > 0 {
			if err := tx.Create(&ingredients).Error; err != nil {
				return err
			}
		}
		if len(steps) > 0 {
			if err := tx.Create(&steps).Error; err != nil {
				return err
			}
		}
		if err := syncRecipeKitchenTags(ctx, tx, recipe); err != nil {
			return err
		}
		return nil
	})
}

func (r *RecipeRepo) ListLatest(ctx context.Context, householdID int64, limit int, keyword, kitchenTag string, excludeDraft bool, recipeStatus string) ([]*Recipe, error) {
	var recipes []*Recipe
	query := r.db.WithContext(ctx).Model(&Recipe{}).Where("household_id = ?", householdID)

	keyword = strings.TrimSpace(strings.ToLower(keyword))
	kitchenTag = strings.TrimSpace(kitchenTag)
	recipeStatus = strings.ToLower(strings.TrimSpace(recipeStatus))
	switch recipeStatus {
	case "draft":
		query = query.Where("status = ?", "draft")
	case "published":
		query = query.Where("status <> ?", "draft")
	default:
		if excludeDraft {
			query = query.Where("status <> ?", "draft")
		}
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("(LOWER(title) LIKE ? OR LOWER(summary) LIKE ?)", like, like)
	}
	if kitchenTag != "" {
		query = query.Where(
			`EXISTS (
				SELECT 1
				FROM recipe_kitchen_tags rkt
				JOIN kitchen_tags kt ON kt.id = rkt.kitchen_tag_id
				WHERE rkt.recipe_id = recipes.id
				  AND rkt.deleted_at IS NULL
				  AND kt.deleted_at IS NULL
				  AND kt.household_id = ?
				  AND kt.name = ?
			) OR recipes.category = ? OR recipes.scenario_tags @> ?::jsonb`,
			householdID,
			kitchenTag,
			kitchenTag,
			jsonTagArray(kitchenTag),
		)
	}

	err := query.Order("created_at DESC").Limit(limit).Find(&recipes).Error
	if err != nil {
		return nil, err
	}
	return recipes, nil
}

func (r *RecipeRepo) GetDetail(ctx context.Context, householdID, recipeID int64) (*RecipeDetail, error) {
	var recipe Recipe
	if err := r.db.WithContext(ctx).First(&recipe, "id = ? and household_id = ?", recipeID, householdID).Error; err != nil {
		return nil, err
	}

	var ingredients []*RecipeIngredient
	if err := r.db.WithContext(ctx).Order("sort_order ASC").Find(&ingredients, "recipe_id = ?", recipeID).Error; err != nil {
		return nil, err
	}

	var steps []*RecipeStep
	if err := r.db.WithContext(ctx).Order("step_no ASC").Find(&steps, "recipe_id = ?", recipeID).Error; err != nil {
		return nil, err
	}

	return &RecipeDetail{
		Recipe:      &recipe,
		Ingredients: ingredients,
		Steps:       steps,
	}, nil
}

// UpdateRecipe replaces ingredients and steps and updates recipe fields (household scoped).
func (r *RecipeRepo) UpdateRecipe(ctx context.Context, householdID int64, recipe *Recipe, ingredients []*RecipeIngredient, steps []*RecipeStep) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing Recipe
		if err := tx.Where("id = ? AND household_id = ?", recipe.ID, householdID).First(&existing).Error; err != nil {
			return err
		}
		updates := map[string]any{
			"title":                recipe.Title,
			"summary":              recipe.Summary,
			"cover_image_url":      recipe.CoverImageURL,
			"gallery_image_urls":   recipe.GalleryImageURLs,
			"video_url":            recipe.VideoURL,
			"status":               recipe.Status,
			"category":             recipe.Category,
			"total_minutes":        recipe.TotalMinutes,
			"difficulty":           recipe.Difficulty,
			"scenario_tags":        recipe.ScenarioTags,
			"flavor_tags":          recipe.FlavorTags,
			"tools":                recipe.Tools,
			"metadata_json":        recipe.MetadataJSON,
			"updated_at":           time.Now(),
		}
		if err := tx.Model(&Recipe{}).Where("id = ? AND household_id = ?", recipe.ID, householdID).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("recipe_id = ?", recipe.ID).Delete(&RecipeIngredient{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("recipe_id = ?", recipe.ID).Delete(&RecipeStep{}).Error; err != nil {
			return err
		}
		for _, ingredient := range ingredients {
			ingredient.RecipeID = recipe.ID
			ingredient.ID = 0
		}
		for _, step := range steps {
			step.RecipeID = recipe.ID
			step.ID = 0
		}
		if len(ingredients) > 0 {
			if err := tx.Create(&ingredients).Error; err != nil {
				return err
			}
		}
		if len(steps) > 0 {
			if err := tx.Create(&steps).Error; err != nil {
				return err
			}
		}
		recipe.HouseholdID = existing.HouseholdID
		recipe.OwnerUserID = existing.OwnerUserID
		if err := syncRecipeKitchenTags(ctx, tx, recipe); err != nil {
			return err
		}
		return nil
	})
}

func (r *RecipeRepo) DeleteRecipe(ctx context.Context, householdID, recipeID int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var rec Recipe
		if err := tx.Where("id = ? AND household_id = ?", recipeID, householdID).First(&rec).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("recipe_id = ?", recipeID).Delete(&RecipeIngredient{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("recipe_id = ?", recipeID).Delete(&RecipeStep{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("recipe_id = ?", recipeID).Delete(&RecipeKitchenTag{}).Error; err != nil {
			return err
		}
		return tx.Delete(&rec).Error
	})
}

func RecipeGalleryURLs(r *Recipe) []string {
	if r == nil {
		return nil
	}
	return uniqueTrimmedStrings(jsonArrayToStrings(r.GalleryImageURLs))
}

func RecipeStepMediaURLs(st *RecipeStep) []string {
	if st == nil {
		return nil
	}
	out := uniqueTrimmedStrings(jsonArrayToStrings(st.MediaURLs))
	if len(out) == 0 && strings.TrimSpace(st.MediaURL) != "" {
		return []string{strings.TrimSpace(st.MediaURL)}
	}
	return out
}

// StepMediaStorage normalizes step images: first URL duplicated in media_url for legacy readers.
func StepMediaStorage(mediaURL string, mediaURLs []string) (string, datatypes.JSON) {
	merged := uniqueTrimmedStrings(mediaURLs)
	if len(merged) == 0 && strings.TrimSpace(mediaURL) != "" {
		merged = []string{strings.TrimSpace(mediaURL)}
	}
	first := ""
	if len(merged) > 0 {
		first = merged[0]
	}
	raw, _ := json.Marshal(merged)
	return first, datatypes.JSON(raw)
}

func uniqueTrimmedStrings(items []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		t := strings.TrimSpace(item)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func GalleryImageURLsJSON(urls []string) datatypes.JSON {
	u := uniqueTrimmedStrings(urls)
	raw, _ := json.Marshal(u)
	return datatypes.JSON(raw)
}

func containsJSONTag(raw []byte, target string) bool {
	if len(raw) == 0 || target == "" {
		return false
	}
	var tags []string
	if err := json.Unmarshal(raw, &tags); err != nil {
		return false
	}
	for _, tag := range tags {
		if tag == target {
			return true
		}
	}
	return false
}

func syncRecipeKitchenTags(ctx context.Context, tx *gorm.DB, recipe *Recipe) error {
	if recipe == nil {
		return nil
	}
	// 必须硬删除：表上有 (recipe_id, kitchen_tag_id, relation_type) 唯一约束；
	// 软删除会保留旧行，再次同步插入相同组合会触发 SQLSTATE 23505。
	if err := tx.WithContext(ctx).Unscoped().Where("recipe_id = ?", recipe.ID).Delete(&RecipeKitchenTag{}).Error; err != nil {
		return err
	}

	primaryName := strings.TrimSpace(recipe.Category)
	secondaryNames := uniqueTagNames(jsonArrayToStrings(recipe.ScenarioTags))
	filteredSecondary := make([]string, 0, len(secondaryNames))
	for _, item := range secondaryNames {
		if item == "" || item == primaryName {
			continue
		}
		filteredSecondary = append(filteredSecondary, item)
	}

	allNames := make([]string, 0, 1+len(filteredSecondary))
	if primaryName != "" {
		allNames = append(allNames, primaryName)
	}
	allNames = append(allNames, filteredSecondary...)
	if len(allNames) == 0 {
		return nil
	}

	var existing []*KitchenTag
	if err := tx.WithContext(ctx).
		Where("household_id = ? AND name IN ?", recipe.HouseholdID, allNames).
		Find(&existing).Error; err != nil {
		return err
	}

	tagByName := make(map[string]*KitchenTag, len(existing))
	for _, item := range existing {
		if item == nil {
			continue
		}
		tagByName[item.Name] = item
	}

	for _, name := range allNames {
		if _, ok := tagByName[name]; ok {
			continue
		}
		tag := &KitchenTag{
			HouseholdID: recipe.HouseholdID,
			Name:        name,
			Icon:        "",
			Color:       "",
			Type:        2,
		}
		if err := tx.WithContext(ctx).Create(tag).Error; err != nil {
			return err
		}
		tagByName[name] = tag
	}

	relations := make([]*RecipeKitchenTag, 0, len(allNames))
	if primaryName != "" {
		if tag := tagByName[primaryName]; tag != nil {
			relations = append(relations, &RecipeKitchenTag{
				RecipeID:     recipe.ID,
				KitchenTagID: tag.ID,
				RelationType: recipeKitchenRelationPrimary,
			})
		}
	}
	for _, name := range filteredSecondary {
		if tag := tagByName[name]; tag != nil {
			relations = append(relations, &RecipeKitchenTag{
				RecipeID:     recipe.ID,
				KitchenTagID: tag.ID,
				RelationType: recipeKitchenRelationSecondary,
			})
		}
	}
	if len(relations) == 0 {
		return nil
	}
	return tx.WithContext(ctx).Create(&relations).Error
}

func jsonTagArray(tag string) string {
	payload, _ := json.Marshal([]string{tag})
	return string(payload)
}

func uniqueTagNames(items []string) []string {
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
