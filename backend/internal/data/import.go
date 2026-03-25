package data

import (
	"context"
	"encoding/json"

	"gorm.io/gorm"
)

type ImportRepo struct {
	db *gorm.DB
}

func NewImportRepo(db *gorm.DB) *ImportRepo {
	return &ImportRepo{db: db}
}

func (r *ImportRepo) Create(ctx context.Context, job *ImportJob) error {
	return r.db.WithContext(ctx).Create(job).Error
}

func (r *ImportRepo) UpdateResult(ctx context.Context, jobID int64, status, stage string, recipeID *int64, payload any, errMsg string) error {
	updates := map[string]any{
		"status":        status,
		"stage":         stage,
		"error_message": errMsg,
	}
	if recipeID != nil {
		updates["recipe_id"] = recipeID
	}
	if payload != nil {
		raw, _ := json.Marshal(payload)
		updates["normalized_payload"] = raw
	}
	return r.db.WithContext(ctx).Model(&ImportJob{}).Where("id = ?", jobID).Updates(updates).Error
}

func (r *ImportRepo) Get(ctx context.Context, jobID int64) (*ImportJob, error) {
	var job ImportJob
	if err := r.db.WithContext(ctx).First(&job, "id = ?", jobID).Error; err != nil {
		return nil, err
	}
	return &job, nil
}
