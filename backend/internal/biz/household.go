package biz

import (
	"context"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/utils"
)

type HouseholdUsecase struct {
	repo *data.HouseholdRepo
}

func NewHouseholdUsecase(repo *data.HouseholdRepo) *HouseholdUsecase {
	return &HouseholdUsecase{repo: repo}
}

func (u *HouseholdUsecase) CreateHousehold(ctx context.Context, actor Actor, name string) (*data.Household, error) {
	household := &data.Household{
		BaseModel: data.BaseModel{ID: utils.GetSFID()},
		Name:      strings.TrimSpace(name),
		ShareCode: utils.GetSFIDBase62(),
		Timezone:  "Asia/Shanghai",
	}
	member := &data.HouseholdMember{
		BaseModel: data.BaseModel{ID: utils.GetSFID()},
		UserID:    actor.UserID,
		Role:      "owner",
	}
	if err := u.repo.CreateHousehold(ctx, household, member); err != nil {
		return nil, err
	}
	return household, nil
}

func (u *HouseholdUsecase) CreateShareCode(ctx context.Context, actor Actor) (*data.Household, error) {
	household, err := u.repo.GetHousehold(ctx, actor.HouseholdID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(household.ShareCode) == "" {
		household.ShareCode = utils.GetSFIDBase62()
		if err := u.repo.UpdateShareCode(ctx, household.ID, household.ShareCode); err != nil {
			return nil, err
		}
	}
	return household, nil
}

func (u *HouseholdUsecase) GetKitchenByShareCode(ctx context.Context, shareCode string) (*data.Household, []*data.Recipe, error) {
	household, err := u.repo.FindByShareCode(ctx, strings.TrimSpace(shareCode))
	if err != nil {
		return nil, nil, err
	}
	recipes, err := u.repo.ListRecipePreviews(ctx, household.ID, 24)
	if err != nil {
		return nil, nil, err
	}
	return household, recipes, nil
}

func (u *HouseholdUsecase) ImportSharedRecipes(ctx context.Context, actor Actor, shareCode string, recipeIDs []int64, kitchenTagID *int64, kitchenTagName string) ([]*data.Recipe, *data.KitchenTag, error) {
	source, err := u.repo.FindByShareCode(ctx, strings.TrimSpace(shareCode))
	if err != nil {
		return nil, nil, err
	}
	if source.ID == actor.HouseholdID {
		return nil, nil, fmt.Errorf("cannot import from current household")
	}

	var tag *data.KitchenTag
	trimmedName := strings.TrimSpace(kitchenTagName)
	if kitchenTagID != nil && *kitchenTagID > 0 {
		tag, err = u.repo.FindKitchenTagByID(ctx, actor.HouseholdID, *kitchenTagID)
		if err != nil {
			return nil, nil, err
		}
		trimmedName = tag.Name
	} else if trimmedName != "" {
		tag, err = u.repo.FindKitchenTagByName(ctx, actor.HouseholdID, trimmedName)
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				tag = &data.KitchenTag{
					BaseModel:   data.BaseModel{ID: utils.GetSFID()},
					HouseholdID: actor.HouseholdID,
					Name:        trimmedName,
					Icon:        "folder-plus",
					Color:       "orange",
				}
				if createErr := u.repo.CreateKitchenTag(ctx, tag); createErr != nil {
					return nil, nil, createErr
				}
			} else {
				return nil, nil, err
			}
		}
	}

	recipes, err := u.repo.ImportRecipes(ctx, source.ID, actor.HouseholdID, actor.UserID, recipeIDs, trimmedName)
	if err != nil {
		return nil, nil, err
	}
	return recipes, tag, nil
}

func (u *HouseholdUsecase) ListKitchenTags(ctx context.Context, actor Actor) ([]*data.KitchenTag, error) {
	return u.repo.ListKitchenTags(ctx, actor.HouseholdID)
}

func (u *HouseholdUsecase) CreateKitchenTag(ctx context.Context, actor Actor, name, icon, color string) (*data.KitchenTag, error) {
	tag := &data.KitchenTag{
		BaseModel:   data.BaseModel{ID: utils.GetSFID()},
		HouseholdID: actor.HouseholdID,
		Name:        strings.TrimSpace(name),
		Icon:        strings.TrimSpace(icon),
		Color:       strings.TrimSpace(color),
		Type:        2,
	}
	if tag.Icon == "" {
		tag.Icon = "folder"
	}
	if tag.Color == "" {
		tag.Color = "orange"
	}
	if err := u.repo.CreateKitchenTag(ctx, tag); err != nil {
		return nil, err
	}
	return tag, nil
}
