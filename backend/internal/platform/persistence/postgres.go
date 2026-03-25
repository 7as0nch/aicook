package persistence

import (
	"context"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/model"
)

func OpenPostgres(cfg *conf.PGDatabase) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
}

func AutoMigrate(ctx context.Context, db *gorm.DB) error {
	_ = ctx
	// 业务唯一索引以 deploy/sql/base.sql 为准；这里仅做字段层面的非破坏性补齐。
	return db.AutoMigrate(
		&model.Household{},
		&model.User{},
		&model.HouseholdMember{},
		&model.KitchenTag{},
		&model.MediaAsset{},
		&model.Recipe{},
		&model.RecipeIngredient{},
		&model.RecipeStep{},
		&model.ImportJob{},
		&model.KnowledgeBase{},
		&model.KnowledgeDocument{},
		&model.KnowledgeChunk{},
		&model.KnowledgeIndexJob{},
		&model.AISession{},
		&model.AIMessage{},
	)
}
