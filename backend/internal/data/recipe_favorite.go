package data

import (
	"context"
	"errors"

	"gorm.io/gorm"
)

// RecipeFavoriteRepo 提供菜谱收藏关系的 CRUD。
// 表 recipe_favorites 在 (household_id, user_id, recipe_id) WHERE deleted_at IS NULL 上唯一。
type RecipeFavoriteRepo struct {
	db *gorm.DB
}

func NewRecipeFavoriteRepo(db *gorm.DB) *RecipeFavoriteRepo {
	return &RecipeFavoriteRepo{db: db}
}

// Add 把 (householdID, userID, recipeID) 标记为收藏。已存在则视为成功（幂等）。
// 返回当前收藏行（id 等可用于后续查询）。
func (r *RecipeFavoriteRepo) Add(ctx context.Context, householdID, userID, recipeID int64) (*RecipeFavorite, error) {
	var existing RecipeFavorite
	err := r.db.WithContext(ctx).
		Where("household_id = ? AND user_id = ? AND recipe_id = ?", householdID, userID, recipeID).
		First(&existing).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := &RecipeFavorite{
		HouseholdID: householdID,
		UserID:      userID,
		RecipeID:    recipeID,
	}
	if err := r.db.WithContext(ctx).Create(row).Error; err != nil {
		// 并发竞争场景：唯一索引冲突再查一次返回已存在行。
		var again RecipeFavorite
		if e2 := r.db.WithContext(ctx).
			Where("household_id = ? AND user_id = ? AND recipe_id = ?", householdID, userID, recipeID).
			First(&again).Error; e2 == nil {
			return &again, nil
		}
		return nil, err
	}
	return row, nil
}

// Remove 软删除收藏关系。不存在时返回 nil 视为成功（幂等）。
func (r *RecipeFavoriteRepo) Remove(ctx context.Context, householdID, userID, recipeID int64) error {
	return r.db.WithContext(ctx).
		Where("household_id = ? AND user_id = ? AND recipe_id = ?", householdID, userID, recipeID).
		Delete(&RecipeFavorite{}).Error
}

// IsFavored 单条判断。
func (r *RecipeFavoriteRepo) IsFavored(ctx context.Context, householdID, userID, recipeID int64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&RecipeFavorite{}).
		Where("household_id = ? AND user_id = ? AND recipe_id = ?", householdID, userID, recipeID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// IsFavoredBatch 批量判断；返回 recipe_id -> true 的 map（只包含已收藏的）。
func (r *RecipeFavoriteRepo) IsFavoredBatch(ctx context.Context, householdID, userID int64, recipeIDs []int64) (map[int64]bool, error) {
	out := make(map[int64]bool, len(recipeIDs))
	if len(recipeIDs) == 0 {
		return out, nil
	}
	var rows []RecipeFavorite
	if err := r.db.WithContext(ctx).
		Where("household_id = ? AND user_id = ? AND recipe_id IN ?", householdID, userID, recipeIDs).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.RecipeID] = true
	}
	return out, nil
}

// ListByUser 按用户列出收藏的菜谱 id，最新在前。beforeID > 0 时只返回 id < beforeID 的记录。
// 返回 (recipeIDs, total)，total 是当前用户在当前家庭下的有效收藏总数（用于"我的"页统计）。
func (r *RecipeFavoriteRepo) ListByUser(ctx context.Context, householdID, userID int64, limit int, beforeID int64) ([]int64, int64, error) {
	if limit <= 0 {
		limit = 20
	}
	query := r.db.WithContext(ctx).Model(&RecipeFavorite{}).
		Where("household_id = ? AND user_id = ?", householdID, userID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	listQ := query.Order("id DESC").Limit(limit)
	if beforeID > 0 {
		listQ = listQ.Where("id < ?", beforeID)
	}
	var rows []RecipeFavorite
	if err := listQ.Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	ids := make([]int64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.RecipeID)
	}
	return ids, total, nil
}

// CountByUser 仅返回收藏总数，用于"我的"页统计，避免拉列表。
func (r *RecipeFavoriteRepo) CountByUser(ctx context.Context, householdID, userID int64) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&RecipeFavorite{}).
		Where("household_id = ? AND user_id = ?", householdID, userID).
		Count(&total).Error
	return total, err
}
