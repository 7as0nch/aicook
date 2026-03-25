package data

import (
	"context"
	"encoding/json"
	"strings"

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
		return nil
	})
}

func (r *RecipeRepo) ListLatest(ctx context.Context, householdID int64, limit int, keyword, kitchenTag string) ([]*Recipe, error) {
	var recipes []*Recipe
	err := r.db.WithContext(ctx).
		Where("household_id = ?", householdID).
		Order("created_at DESC").
		Limit(limit).
		Find(&recipes).Error
	if err != nil {
		return nil, err
	}

	keyword = strings.TrimSpace(strings.ToLower(keyword))
	kitchenTag = strings.TrimSpace(kitchenTag)
	if keyword == "" && kitchenTag == "" {
		return recipes, nil
	}

	filtered := make([]*Recipe, 0, len(recipes))
	for _, recipe := range recipes {
		if keyword != "" {
			title := strings.ToLower(recipe.Title + " " + recipe.Summary)
			if !strings.Contains(title, keyword) {
				continue
			}
		}
		if kitchenTag != "" {
			if strings.TrimSpace(recipe.Category) != kitchenTag && !containsJSONTag(recipe.ScenarioTags, kitchenTag) {
				continue
			}
		}
		filtered = append(filtered, recipe)
	}
	return filtered, nil
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
