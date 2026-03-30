package data

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/utils"
)

type HouseholdRepo struct {
	db *gorm.DB
}

func NewHouseholdRepo(db *gorm.DB) *HouseholdRepo {
	return &HouseholdRepo{db: db}
}

func (r *HouseholdRepo) CreateHousehold(ctx context.Context, household *Household, member *HouseholdMember) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if household.ID == 0 {
			household.ID = utils.GetSFID()
		}
		if err := tx.Create(household).Error; err != nil {
			return err
		}
		if member != nil {
			if member.ID == 0 {
				member.ID = utils.GetSFID()
			}
			member.HouseholdID = household.ID
			if err := tx.Create(member).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *HouseholdRepo) GetHousehold(ctx context.Context, householdID int64) (*Household, error) {
	var household Household
	if err := r.db.WithContext(ctx).First(&household, "id = ?", householdID).Error; err != nil {
		return nil, err
	}
	return &household, nil
}

func (r *HouseholdRepo) FindByShareCode(ctx context.Context, shareCode string) (*Household, error) {
	var household Household
	if err := r.db.WithContext(ctx).Where("share_code = ?", shareCode).First(&household).Error; err != nil {
		return nil, err
	}
	return &household, nil
}

func (r *HouseholdRepo) UpdateShareCode(ctx context.Context, householdID int64, shareCode string) error {
	return r.db.WithContext(ctx).Model(&Household{}).
		Where("id = ?", householdID).
		Update("share_code", shareCode).Error
}

func (r *HouseholdRepo) ListRecipePreviews(ctx context.Context, householdID int64, limit int) ([]*Recipe, error) {
	if limit <= 0 {
		limit = 24
	}
	var recipes []*Recipe
	err := r.db.WithContext(ctx).
		Where("household_id = ?", householdID).
		Order("created_at desc").
		Limit(limit).
		Find(&recipes).Error
	return recipes, err
}

func (r *HouseholdRepo) ListKitchenTags(ctx context.Context, householdID int64) ([]*KitchenTag, error) {
	var tags []*KitchenTag
	err := r.db.WithContext(ctx).
		Where("household_id = ? OR type = 1", householdID).
		Order("type asc, created_at asc").
		Find(&tags).Error
	return tags, err
}

func (r *HouseholdRepo) CreateKitchenTag(ctx context.Context, tag *KitchenTag) error {
	if tag.ID == 0 {
		tag.ID = utils.GetSFID()
	}
	return r.db.WithContext(ctx).Create(tag).Error
}

var ErrKitchenTagNotMutable = errors.New("kitchen tag not found or not editable")

func (r *HouseholdRepo) UpdateKitchenTag(ctx context.Context, householdID, tagID int64, name, icon, color string) (*KitchenTag, error) {
	var updated *KitchenTag
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tag, err := r.findMutableKitchenTagTx(tx, householdID, tagID)
		if err != nil {
			return err
		}
		tag.Name = name
		tag.Icon = icon
		tag.Color = color
		if err := tx.Save(tag).Error; err != nil {
			return err
		}
		updated = tag
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (r *HouseholdRepo) findMutableKitchenTagTx(tx *gorm.DB, householdID, tagID int64) (*KitchenTag, error) {
	var tag KitchenTag
	err := tx.Where("id = ? AND household_id = ? AND type = ?", tagID, householdID, 2).First(&tag).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrKitchenTagNotMutable
		}
		return nil, err
	}
	return &tag, nil
}

func (r *HouseholdRepo) DeleteKitchenTag(ctx context.Context, householdID, tagID int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := r.findMutableKitchenTagTx(tx, householdID, tagID); err != nil {
			return err
		}
		if err := tx.Unscoped().Where("kitchen_tag_id = ?", tagID).Delete(&RecipeKitchenTag{}).Error; err != nil {
			return err
		}
		return tx.Unscoped().Delete(&KitchenTag{}, tagID).Error
	})
}

func (r *HouseholdRepo) FindKitchenTagByName(ctx context.Context, householdID int64, name string) (*KitchenTag, error) {
	var tag KitchenTag
	if err := r.db.WithContext(ctx).
		Where("(household_id = ? OR type = 1) and name = ?", householdID, name).
		First(&tag).Error; err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *HouseholdRepo) FindKitchenTagByID(ctx context.Context, householdID, tagID int64) (*KitchenTag, error) {
	var tag KitchenTag
	if err := r.db.WithContext(ctx).
		Where("(household_id = ? OR type = 1) and id = ?", householdID, tagID).
		First(&tag).Error; err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *HouseholdRepo) ImportRecipes(ctx context.Context, sourceHouseholdID, targetHouseholdID, targetUserID int64, recipeIDs []int64, kitchenTagName string) ([]*Recipe, error) {
	if len(recipeIDs) == 0 {
		return nil, nil
	}

	var imported []*Recipe
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var sources []*Recipe
		if err := tx.Where("household_id = ? AND id IN ?", sourceHouseholdID, recipeIDs).Find(&sources).Error; err != nil {
			return err
		}
		for _, src := range sources {
			var ingredients []*RecipeIngredient
			if err := tx.Where("recipe_id = ?", src.ID).Order("sort_order asc").Find(&ingredients).Error; err != nil {
				return err
			}
			var steps []*RecipeStep
			if err := tx.Where("recipe_id = ?", src.ID).Order("step_no asc").Find(&steps).Error; err != nil {
				return err
			}

			cloned := cloneRecipe(src, targetHouseholdID, targetUserID, kitchenTagName)
			if err := tx.Create(cloned).Error; err != nil {
				return err
			}

			for _, ingredient := range ingredients {
				copyItem := *ingredient
				copyItem.ID = utils.GetSFID()
				copyItem.RecipeID = cloned.ID
				if err := tx.Create(&copyItem).Error; err != nil {
					return err
				}
			}
			for _, step := range steps {
				copyItem := *step
				copyItem.ID = utils.GetSFID()
				copyItem.RecipeID = cloned.ID
				if err := tx.Create(&copyItem).Error; err != nil {
					return err
				}
			}
			imported = append(imported, cloned)
		}
		return nil
	})
	return imported, err
}

func cloneRecipe(src *Recipe, targetHouseholdID, targetUserID int64, kitchenTagName string) *Recipe {
	scenarioTags := jsonArrayToStrings(src.ScenarioTags)
	if name := strings.TrimSpace(kitchenTagName); name != "" && !containsString(scenarioTags, name) {
		scenarioTags = append([]string{name}, scenarioTags...)
	}
	scenarioTagsJSON, _ := json.Marshal(scenarioTags)
	toolsJSON, _ := json.Marshal(jsonArrayToStrings(src.Tools))
	flavorJSON, _ := json.Marshal(jsonArrayToStrings(src.FlavorTags))

	cloned := *src
	cloned.ID = utils.GetSFID()
	cloned.HouseholdID = targetHouseholdID
	cloned.OwnerUserID = targetUserID
	cloned.SourceHouseholdID = &src.HouseholdID
	cloned.ForkedFromRecipeID = &src.ID
	cloned.ScenarioTags = scenarioTagsJSON
	cloned.Tools = toolsJSON
	cloned.FlavorTags = flavorJSON
	if strings.TrimSpace(cloned.Category) == "" && strings.TrimSpace(kitchenTagName) != "" {
		cloned.Category = strings.TrimSpace(kitchenTagName)
	}
	return &cloned
}

func jsonArrayToStrings(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var items []string
	_ = json.Unmarshal(raw, &items)
	return items
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
