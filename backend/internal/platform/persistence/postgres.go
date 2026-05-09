package persistence

import (
	"context"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/model"
)

func OpenPostgres(cfg *conf.PGDatabase) (*gorm.DB, error) {
	gormLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)
	return gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger:                                   gormLogger,
		DisableForeignKeyConstraintWhenMigrating: true,
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
		&model.RecipeKitchenTag{},
		&model.MediaAsset{},
		&model.Recipe{},
		&model.RecipeIngredient{},
		&model.RecipeStep{},
		&model.ImportJob{},
		&model.KnowledgeBase{},
		&model.KnowledgeDocument{},
		&model.KnowledgeChunk{},
		&model.KnowledgeIndexJob{},
		&model.HouseholdAIMemory{},
		&model.KnowledgeGraphEdge{},
		&model.AISession{},
		&model.AIMessage{},
		&model.MealPlan{},
		&model.MealPlanItem{},
		&model.ShoppingList{},
		&model.ShoppingListItem{},
		&model.InventoryItem{},
		&model.RecipeShare{},
		&model.CookingHistory{},
	)
}
