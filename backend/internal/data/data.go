package data

import (
	"context"

	"github.com/google/wire"
	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/model"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"github.com/chengjiang/aicook/backend/internal/platform/demo"
	"github.com/chengjiang/aicook/backend/internal/platform/embeddings"
	"github.com/chengjiang/aicook/backend/internal/platform/inference"
	"github.com/chengjiang/aicook/backend/internal/platform/persistence"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
)

var ProviderSet = wire.NewSet(
	NewDB,
	NewRedis,
	NewObjectStorage,
	NewInferenceClient,
	NewAIRuntime,
	NewEmbeddingClient,
	auth.NewAuthRepo,
	NewAuthRepo,
	NewHouseholdRepo,
	NewRecipeRepo,
	NewMediaRepo,
	NewImportRepo,
	NewKnowledgeRepo,
	NewAIRepo,
	NewKitchenOpsRepo,
	NewCookingProgressStore,
	NewCookingHistoryRepo,
	NewRecipeFavoriteRepo,
)

func NewDB(cfg *conf.Bootstrap) (*gorm.DB, func(), error) {
	db, err := persistence.OpenPostgres(cfg.GetData().GetPgDatabase())
	if err != nil {
		return nil, nil, err
	}

	ctx := context.Background()
	if cfg.GetData().GetPgDatabase().GetAutoMigrate() {
		// 当前仓库以 deploy/sql/base.sql 作为业务 schema 主来源。
		// 1) 空库首次引导：跑完整 AutoMigrate 创建所有表。
		if !db.Migrator().HasTable(&CookingHistory{}) {
			if err := persistence.AutoMigrate(ctx, db); err != nil {
				return nil, nil, err
			}
		}
		// 2) 已存在业务表：仅对"曾经增量加字段"的模型跑 AutoMigrate。
		//    GORM AutoMigrate 只 ADD COLUMN / 新建索引，不会删/改既有列，
		//    所以可以安全每次启动跑一遍，自动补齐手写 SQL 漏跑的迁移。
		//    新增字段时把对应 model 加进这个列表即可。
		incremental := []any{
			&model.User{}, // wx_openid / wx_unionid（2026-06 微信登录）
		}
		if err := db.AutoMigrate(incremental...); err != nil {
			return nil, nil, err
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
	return airuntime.New(cfg.GetAi(), cfg.GetOss())
}

func NewEmbeddingClient(cfg *conf.Bootstrap) *embeddings.Client {
	return embeddings.NewClient(cfg)
}
