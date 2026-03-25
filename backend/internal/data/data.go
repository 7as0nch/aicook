package data

import (
	"context"

	"github.com/google/wire"
	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"github.com/chengjiang/aicook/backend/internal/platform/demo"
	"github.com/chengjiang/aicook/backend/internal/platform/inference"
	"github.com/chengjiang/aicook/backend/internal/platform/persistence"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
)

var ProviderSet = wire.NewSet(
	NewDB,
	NewObjectStorage,
	NewInferenceClient,
	NewAIRuntime,
	auth.NewAuthRepo,
	NewAuthRepo,
	NewHouseholdRepo,
	NewRecipeRepo,
	NewMediaRepo,
	NewImportRepo,
	NewKnowledgeRepo,
	NewAIRepo,
)

func NewDB(cfg *conf.Bootstrap) (*gorm.DB, func(), error) {
	db, err := persistence.OpenPostgres(cfg.GetData().GetPgDatabase())
	if err != nil {
		return nil, nil, err
	}

	ctx := context.Background()
	if cfg.GetData().GetPgDatabase().GetAutoMigrate() {
		// 当前仓库以 deploy/sql/base.sql 作为业务 schema 主来源。
		// 只有在空库/本地引导场景下，才允许 AutoMigrate 创建基础表结构；
		// 已存在业务表时跳过，避免 GORM 试图重命名或删除手写 SQL 建立的约束与索引。
		if !db.Migrator().HasTable(&Household{}) {
			if err := persistence.AutoMigrate(ctx, db); err != nil {
				return nil, nil, err
			}
		}
	}
	if err := demo.EnsureSeed(ctx, db); err != nil {
		return nil, nil, err
	}
	return db, func() {}, nil
}

func NewObjectStorage(cfg *conf.Bootstrap) (storage.ObjectStorage, func(), error) {
	objectStorage, err := storage.NewMinio(cfg.GetOss())
	if err != nil {
		return nil, nil, err
	}

	ctx := context.Background()
	if err := objectStorage.EnsureBucket(ctx, cfg.GetOss().GetMediaBucket()); err != nil {
		return nil, nil, err
	}
	if err := objectStorage.EnsureBucket(ctx, cfg.GetOss().GetKnowledgeBucket()); err != nil {
		return nil, nil, err
	}
	return objectStorage, func() {}, nil
}

func NewInferenceClient(cfg *conf.Bootstrap) *inference.Client {
	return inference.NewClient(cfg.GetInference())
}

func NewAIRuntime(cfg *conf.Bootstrap) *airuntime.Runtime {
	return airuntime.New(cfg.GetAi())
}
