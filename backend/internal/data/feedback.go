package data

import (
	"context"

	"gorm.io/gorm"

	"github.com/7as0nch/gocommon/utils"
)

// FeedbackRepo 负责用户意见反馈的持久化与读取。
type FeedbackRepo struct {
	db *gorm.DB
}

func NewFeedbackRepo(db *gorm.DB) *FeedbackRepo {
	return &FeedbackRepo{db: db}
}

// Create 写入一条反馈；调用方应保证 Content / HouseholdID / UserID 已填充。
func (r *FeedbackRepo) Create(ctx context.Context, entry *Feedback) error {
	if entry.ID == 0 {
		entry.ID = utils.GetSFID()
	}
	return r.db.WithContext(ctx).Create(entry).Error
}

// ListByUser 按用户拉取反馈，支持游标分页（beforeID 为上一页最后一条的 id）。
// limit <= 0 时使用 20 兜底；limit > 100 截断到 100。
func (r *FeedbackRepo) ListByUser(ctx context.Context, userID int64, limit int, beforeID int64) ([]*Feedback, error) {
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
	var items []*Feedback
	if err := query.
		Order("id DESC").
		Limit(limit).
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}
