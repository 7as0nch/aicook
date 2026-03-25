package data

import (
	"context"

	"gorm.io/gorm"
)

type MediaRepo struct {
	db *gorm.DB
}

func NewMediaRepo(db *gorm.DB) *MediaRepo {
	return &MediaRepo{db: db}
}

func (r *MediaRepo) Create(ctx context.Context, asset *MediaAsset) error {
	return r.db.WithContext(ctx).Create(asset).Error
}

func (r *MediaRepo) Get(ctx context.Context, id int64) (*MediaAsset, error) {
	var asset MediaAsset
	if err := r.db.WithContext(ctx).First(&asset, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *MediaRepo) ListByIDs(ctx context.Context, ids []int64) ([]*MediaAsset, error) {
	var assets []*MediaAsset
	if err := r.db.WithContext(ctx).Find(&assets, "id IN ?", ids).Error; err != nil {
		return nil, err
	}
	return assets, nil
}
