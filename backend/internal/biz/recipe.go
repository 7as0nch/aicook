package biz

import (
	"context"

	"github.com/chengjiang/aicook/backend/internal/data"
)

type RecipeRepo interface {
	ListLatest(ctx context.Context, householdID int64, limit int, keyword, kitchenTag string) ([]*data.Recipe, error)
	GetDetail(ctx context.Context, householdID, recipeID int64) (*data.RecipeDetail, error)
	CreateDraft(ctx context.Context, recipe *data.Recipe, ingredients []*data.RecipeIngredient, steps []*data.RecipeStep) error
}

type RecipeUsecase struct {
	repo RecipeRepo
}

func NewRecipeUsecase(repo *data.RecipeRepo) *RecipeUsecase {
	return &RecipeUsecase{repo: repo}
}

func (u *RecipeUsecase) ListLatest(ctx context.Context, householdID int64, limit int, keyword, kitchenTag string) ([]*data.Recipe, error) {
	if limit <= 0 {
		limit = 12
	}
	return u.repo.ListLatest(ctx, householdID, limit, keyword, kitchenTag)
}

func (u *RecipeUsecase) GetDetail(ctx context.Context, householdID, recipeID int64) (*data.RecipeDetail, error) {
	return u.repo.GetDetail(ctx, householdID, recipeID)
}
