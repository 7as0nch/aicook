package biz

import (
	"context"
	"fmt"

	"github.com/chengjiang/aicook/backend/internal/data"
)

// RecipeFavoriteUsecase 处理收藏的业务逻辑。
// 注：当前实现假设 RecipeUsecase 用现有 repo 取菜谱详情；这里只负责收藏关系。
type RecipeFavoriteUsecase struct {
	repo       *data.RecipeFavoriteRepo
	recipeRepo *data.RecipeRepo
}

func NewRecipeFavoriteUsecase(repo *data.RecipeFavoriteRepo, recipeRepo *data.RecipeRepo) *RecipeFavoriteUsecase {
	return &RecipeFavoriteUsecase{repo: repo, recipeRepo: recipeRepo}
}

// Add 添加收藏。会校验菜谱存在 + 属于当前家庭。
func (u *RecipeFavoriteUsecase) Add(ctx context.Context, householdID, userID, recipeID int64) (*data.Recipe, error) {
	if recipeID <= 0 {
		return nil, fmt.Errorf("recipe id is required")
	}
	// 校验菜谱在当前家庭可见。GetDetail 会校验 household_id，找不到时报错。
	detail, err := u.recipeRepo.GetDetail(ctx, householdID, recipeID)
	if err != nil {
		return nil, err
	}
	if _, err := u.repo.Add(ctx, householdID, userID, recipeID); err != nil {
		return nil, err
	}
	return detail.Recipe, nil
}

// Remove 取消收藏。幂等。
func (u *RecipeFavoriteUsecase) Remove(ctx context.Context, householdID, userID, recipeID int64) error {
	if recipeID <= 0 {
		return fmt.Errorf("recipe id is required")
	}
	return u.repo.Remove(ctx, householdID, userID, recipeID)
}

// ListMyFavorites 返回当前用户收藏的菜谱列表（recipe 实体），按收藏时间倒序。
// 返回值 total 是用户在当前家庭下收藏的总数（用于分页/我的页统计）。
func (u *RecipeFavoriteUsecase) ListMyFavorites(ctx context.Context, householdID, userID int64, limit int, beforeID int64) ([]*data.Recipe, int64, error) {
	if limit <= 0 {
		limit = 20
	}
	recipeIDs, total, err := u.repo.ListByUser(ctx, householdID, userID, limit, beforeID)
	if err != nil {
		return nil, 0, err
	}
	if len(recipeIDs) == 0 {
		return nil, total, nil
	}
	recipes := make([]*data.Recipe, 0, len(recipeIDs))
	for _, rid := range recipeIDs {
		detail, err := u.recipeRepo.GetDetail(ctx, householdID, rid)
		if err != nil {
			// 收藏的菜谱被删除时跳过，不阻塞整列表（保持总数与列表项可能不一致）。
			continue
		}
		recipes = append(recipes, detail.Recipe)
	}
	return recipes, total, nil
}

// CountByUser 仅返回数量，供我的页 28 收藏统计。
func (u *RecipeFavoriteUsecase) CountByUser(ctx context.Context, householdID, userID int64) (int64, error) {
	return u.repo.CountByUser(ctx, householdID, userID)
}

// IsFavored 单条判断是否已收藏。
func (u *RecipeFavoriteUsecase) IsFavored(ctx context.Context, householdID, userID, recipeID int64) (bool, error) {
	return u.repo.IsFavored(ctx, householdID, userID, recipeID)
}

// IsFavoredBatch 批量判断，便于 list/grid 渲染时一次性设置 favored 字段。
func (u *RecipeFavoriteUsecase) IsFavoredBatch(ctx context.Context, householdID, userID int64, recipeIDs []int64) (map[int64]bool, error) {
	return u.repo.IsFavoredBatch(ctx, householdID, userID, recipeIDs)
}
