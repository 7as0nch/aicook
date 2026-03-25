package demo

import (
	"context"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/model"
	"github.com/chengjiang/aicook/backend/internal/platform/identity"
)

func EnsureSeed(ctx context.Context, db *gorm.DB) error {
	// 这里仅保留与 base.sql 一致的兜底演示数据，避免本地只开 backend 时出现空用户/空厨房。
	household := model.Household{
		BaseModel: model.BaseModel{ID: identity.DefaultHouseholdID},
		Name:      "默认家庭",
		ShareCode: "DEMOHOME",
		Timezone:  "Asia/Shanghai",
	}
	if err := db.WithContext(ctx).FirstOrCreate(&household, model.Household{BaseModel: model.BaseModel{ID: identity.DefaultHouseholdID}}).Error; err != nil {
		return err
	}

	user := model.User{
		BaseModel:    model.BaseModel{ID: identity.DefaultUserID},
		HouseholdID:  identity.DefaultHouseholdID,
		Username:     "demo",
		PasswordHash: "$2a$10$1qhQ7TNrkKfPfKCcG4WMb.g00wQ1mt9TQc2Ma8wN1UQsvL4Tmx8Hy",
		Phone:        "",
		DisplayName:  "演示用户",
		Email:        "demo@aicook.local",
		Status:       "active",
	}
	if err := db.WithContext(ctx).FirstOrCreate(&user, model.User{BaseModel: model.BaseModel{ID: identity.DefaultUserID}}).Error; err != nil {
		return err
	}

	member := model.HouseholdMember{
		BaseModel:   model.BaseModel{ID: 202503240000001003},
		HouseholdID: identity.DefaultHouseholdID,
		UserID:      identity.DefaultUserID,
		Role:        "owner",
	}
	if err := db.WithContext(ctx).FirstOrCreate(&member, model.HouseholdMember{
		HouseholdID: identity.DefaultHouseholdID,
		UserID:      identity.DefaultUserID,
	}).Error; err != nil {
		return err
	}

	defaultTags := []model.KitchenTag{
		{BaseModel: model.BaseModel{ID: 202503240000001011}, HouseholdID: identity.DefaultHouseholdID, Name: "家常菜", Icon: "home", Color: "orange", Type: 2},
		{BaseModel: model.BaseModel{ID: 202503240000001012}, HouseholdID: identity.DefaultHouseholdID, Name: "快手菜", Icon: "zap", Color: "amber", Type: 2},
		{BaseModel: model.BaseModel{ID: 202503240000001013}, HouseholdID: identity.DefaultHouseholdID, Name: "下饭菜", Icon: "utensils", Color: "stone", Type: 2},
	}
	for _, tag := range defaultTags {
		if err := db.WithContext(ctx).FirstOrCreate(&tag, model.KitchenTag{
			HouseholdID: identity.DefaultHouseholdID,
			Name:        tag.Name,
		}).Error; err != nil {
			return err
		}
	}

	return nil
}
