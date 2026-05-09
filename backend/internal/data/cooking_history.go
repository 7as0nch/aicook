package data

import (
	"context"
	"time"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/utils"
)

// CookingHistoryRepo 负责烹饪历史记录的持久化与读取，独立于 CookingProgress（后者是临时性正在做菜的状态）。
type CookingHistoryRepo struct {
	db *gorm.DB
}

func NewCookingHistoryRepo(db *gorm.DB) *CookingHistoryRepo {
	return &CookingHistoryRepo{db: db}
}

// Create 写入一条历史记录；调用方应保证 RecipeID 与快照字段已填充。
func (r *CookingHistoryRepo) Create(ctx context.Context, entry *CookingHistory) error {
	if entry.ID == 0 {
		entry.ID = utils.GetSFID()
	}
	if entry.CompletedAt.IsZero() {
		entry.CompletedAt = time.Now()
	}
	return r.db.WithContext(ctx).Create(entry).Error
}

// ListByUser 按用户拉取历史，支持游标分页（before_id 为上一页最后一条的 id）。
// limit <= 0 时使用 20 兜底；limit > 100 截断到 100。
func (r *CookingHistoryRepo) ListByUser(ctx context.Context, userID int64, limit int, beforeID int64) ([]*CookingHistory, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	query := r.db.WithContext(ctx).
		Where("user_id = ?", userID)
	if beforeID > 0 {
		query = query.Where("id < ?", beforeID)
	}
	var items []*CookingHistory
	if err := query.
		Order("completed_at DESC, id DESC").
		Limit(limit).
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ListRecentForUser 取首页最近做过列表，强制限制条数避免误用。
func (r *CookingHistoryRepo) ListRecentForUser(ctx context.Context, userID int64, limit int) ([]*CookingHistory, error) {
	if limit <= 0 {
		limit = 8
	}
	if limit > 30 {
		limit = 30
	}
	var items []*CookingHistory
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("completed_at DESC, id DESC").
		Limit(limit).
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ListRecentRecipeIDsForUser 返回用户最近 N 天做过的 recipe_id，供推荐降权使用。
// withinDays <= 0 时不做时间过滤；返回值已去重，但保留按 completed_at 倒序的偏好顺序。
func (r *CookingHistoryRepo) ListRecentRecipeIDsForUser(ctx context.Context, userID int64, withinDays int, limit int) ([]int64, error) {
	if limit <= 0 {
		limit = 50
	}
	query := r.db.WithContext(ctx).
		Model(&CookingHistory{}).
		Where("user_id = ?", userID)
	if withinDays > 0 {
		query = query.Where("completed_at >= ?", time.Now().AddDate(0, 0, -withinDays))
	}
	var rows []*CookingHistory
	if err := query.
		Select("id, recipe_id, completed_at").
		Order("completed_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	seen := make(map[int64]struct{}, len(rows))
	out := make([]int64, 0, len(rows))
	for _, row := range rows {
		if row == nil || row.RecipeID == 0 {
			continue
		}
		if _, ok := seen[row.RecipeID]; ok {
			continue
		}
		seen[row.RecipeID] = struct{}{}
		out = append(out, row.RecipeID)
	}
	return out, nil
}
