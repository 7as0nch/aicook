package data

import (
	"context"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/utils"
)

type KitchenOpsRepo struct {
	db *gorm.DB
}

func NewKitchenOpsRepo(db *gorm.DB) *KitchenOpsRepo {
	return &KitchenOpsRepo{db: db}
}

func (r *KitchenOpsRepo) GetMealPlanByWeek(ctx context.Context, householdID int64, weekStart time.Time) (*MealPlan, []*MealPlanItem, error) {
	var plan MealPlan
	err := r.db.WithContext(ctx).
		Where("household_id = ? AND week_start_date = ?", householdID, dateOnly(weekStart)).
		First(&plan).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	var items []*MealPlanItem
	if err := r.db.WithContext(ctx).
		Where("meal_plan_id = ?", plan.ID).
		Order("plan_date ASC, meal_slot ASC, sort_order ASC, created_at ASC").
		Find(&items).Error; err != nil {
		return nil, nil, err
	}
	return &plan, items, nil
}

func (r *KitchenOpsRepo) SaveMealPlanWithItems(ctx context.Context, plan *MealPlan, items []*MealPlanItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing MealPlan
		err := tx.Where("household_id = ? AND week_start_date = ?", plan.HouseholdID, dateOnly(plan.WeekStartDate)).First(&existing).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if err == gorm.ErrRecordNotFound {
			if plan.ID == 0 {
				plan.ID = utils.GetSFID()
			}
			plan.WeekStartDate = dateOnly(plan.WeekStartDate)
			if err := tx.Create(plan).Error; err != nil {
				return err
			}
		} else {
			existing.Timezone = plan.Timezone
			existing.Source = plan.Source
			existing.MetadataJSON = plan.MetadataJSON
			existing.WeekStartDate = dateOnly(plan.WeekStartDate)
			if err := tx.Model(&existing).Updates(map[string]any{
				"timezone":        existing.Timezone,
				"source":          existing.Source,
				"metadata_json":   existing.MetadataJSON,
				"week_start_date": existing.WeekStartDate,
				"updated_at":      time.Now(),
			}).Error; err != nil {
				return err
			}
			plan.ID = existing.ID
		}
		if err := tx.Unscoped().Where("meal_plan_id = ?", plan.ID).Delete(&MealPlanItem{}).Error; err != nil {
			return err
		}
		for _, item := range items {
			if item.ID == 0 {
				item.ID = utils.GetSFID()
			}
			item.MealPlanID = plan.ID
			item.HouseholdID = plan.HouseholdID
			item.PlanDate = dateOnly(item.PlanDate)
		}
		if len(items) > 0 {
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *KitchenOpsRepo) GetShoppingListByWeek(ctx context.Context, householdID int64, weekStart time.Time) (*ShoppingList, []*ShoppingListItem, error) {
	if weekStart.IsZero() {
		return nil, nil, nil
	}
	var list ShoppingList
	err := r.db.WithContext(ctx).
		Where("household_id = ? AND week_start_date = ?", householdID, dateOnly(weekStart)).
		Order("created_at DESC").
		First(&list).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	var items []*ShoppingListItem
	if err := r.db.WithContext(ctx).
		Where("shopping_list_id = ?", list.ID).
		Order("sort_order ASC, created_at ASC").
		Find(&items).Error; err != nil {
		return nil, nil, err
	}
	return &list, items, nil
}

func (r *KitchenOpsRepo) FindShoppingListByID(ctx context.Context, householdID, listID int64) (*ShoppingList, []*ShoppingListItem, error) {
	var list ShoppingList
	if err := r.db.WithContext(ctx).Where("id = ? AND household_id = ?", listID, householdID).First(&list).Error; err != nil {
		return nil, nil, err
	}
	var items []*ShoppingListItem
	if err := r.db.WithContext(ctx).
		Where("shopping_list_id = ?", list.ID).
		Order("sort_order ASC, created_at ASC").
		Find(&items).Error; err != nil {
		return nil, nil, err
	}
	return &list, items, nil
}

func (r *KitchenOpsRepo) SaveShoppingListWithItems(ctx context.Context, list *ShoppingList, items []*ShoppingListItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing ShoppingList
		err := tx.Where("household_id = ? AND week_start_date = ? AND status <> ?", list.HouseholdID, dateOnly(list.WeekStartDate), "completed").
			Order("created_at DESC").First(&existing).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if err == gorm.ErrRecordNotFound {
			if list.ID == 0 {
				list.ID = utils.GetSFID()
			}
			list.WeekStartDate = dateOnly(list.WeekStartDate)
			if err := tx.Create(list).Error; err != nil {
				return err
			}
		} else {
			existing.MealPlanID = list.MealPlanID
			existing.Status = list.Status
			existing.MetadataJSON = list.MetadataJSON
			existing.CompletedAt = list.CompletedAt
			if err := tx.Model(&existing).Updates(map[string]any{
				"meal_plan_id":   existing.MealPlanID,
				"status":         existing.Status,
				"metadata_json":  existing.MetadataJSON,
				"completed_at":   existing.CompletedAt,
				"updated_at":     time.Now(),
			}).Error; err != nil {
				return err
			}
			list.ID = existing.ID
		}
		if err := tx.Unscoped().Where("shopping_list_id = ?", list.ID).Delete(&ShoppingListItem{}).Error; err != nil {
			return err
		}
		for _, item := range items {
			if item.ID == 0 {
				item.ID = utils.GetSFID()
			}
			item.ShoppingListID = list.ID
			item.HouseholdID = list.HouseholdID
		}
		if len(items) > 0 {
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *KitchenOpsRepo) UpdateShoppingListItem(ctx context.Context, householdID, listID, itemID int64, updates map[string]any) (*ShoppingListItem, error) {
	var item ShoppingListItem
	if err := r.db.WithContext(ctx).
		Where("shopping_list_id = ? AND household_id = ? AND id = ?", listID, householdID, itemID).
		First(&item).Error; err != nil {
		return nil, err
	}
	updates["updated_at"] = time.Now()
	if err := r.db.WithContext(ctx).Model(&item).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := r.db.WithContext(ctx).First(&item, "id = ?", itemID).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *KitchenOpsRepo) CompleteShoppingList(ctx context.Context, householdID, listID int64, inventoryItems []*InventoryItem) (*ShoppingList, error) {
	var list ShoppingList
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND household_id = ?", listID, householdID).First(&list).Error; err != nil {
			return err
		}
		now := time.Now()
		if err := tx.Model(&list).Updates(map[string]any{
			"status":       "completed",
			"completed_at": &now,
			"updated_at":   now,
		}).Error; err != nil {
			return err
		}
		for _, item := range inventoryItems {
			if err := upsertInventoryItemTx(tx, item); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &list, nil
}

func (r *KitchenOpsRepo) ListInventory(ctx context.Context, householdID int64, keyword string) ([]*InventoryItem, error) {
	var items []*InventoryItem
	query := r.db.WithContext(ctx).Where("household_id = ?", householdID).Order("status ASC, updated_at DESC, created_at DESC")
	keyword = strings.TrimSpace(strings.ToLower(keyword))
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?", like, like)
	}
	if err := query.Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (r *KitchenOpsRepo) UpsertInventoryItems(ctx context.Context, items []*InventoryItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			if err := upsertInventoryItemTx(tx, item); err != nil {
				return err
			}
		}
		return nil
	})
}

func upsertInventoryItemTx(tx *gorm.DB, item *InventoryItem) error {
	var existing InventoryItem
	err := tx.Where("household_id = ? AND normalized_name = ? AND kind = ? AND status <> ?",
		item.HouseholdID, item.NormalizedName, item.Kind, "archived").
		Order("updated_at DESC").
		First(&existing).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}
	if err == gorm.ErrRecordNotFound {
		if item.ID == 0 {
			item.ID = utils.GetSFID()
		}
		return tx.Create(item).Error
	}
	updates := map[string]any{
		"name":           item.Name,
		"category":       item.Category,
		"quantity_value": item.QuantityValue,
		"unit":           item.Unit,
		"quantity_text":  item.QuantityText,
		"source_type":    item.SourceType,
		"confidence":     item.Confidence,
		"status":         item.Status,
		"expires_at":     item.ExpiresAt,
		"last_seen_at":   item.LastSeenAt,
		"metadata_json":  item.MetadataJSON,
		"updated_at":     time.Now(),
	}
	return tx.Model(&existing).Updates(updates).Error
}

func (r *KitchenOpsRepo) UpdateInventoryItem(ctx context.Context, householdID, itemID int64, updates map[string]any) (*InventoryItem, error) {
	var item InventoryItem
	if err := r.db.WithContext(ctx).Where("id = ? AND household_id = ?", itemID, householdID).First(&item).Error; err != nil {
		return nil, err
	}
	updates["updated_at"] = time.Now()
	if err := r.db.WithContext(ctx).Model(&item).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := r.db.WithContext(ctx).First(&item, "id = ?", itemID).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *KitchenOpsRepo) CreateRecipeShare(ctx context.Context, share *RecipeShare) error {
	if share.ID == 0 {
		share.ID = utils.GetSFID()
	}
	return r.db.WithContext(ctx).Create(share).Error
}

func (r *KitchenOpsRepo) FindRecipeShareByRecipe(ctx context.Context, householdID, recipeID int64) (*RecipeShare, error) {
	var share RecipeShare
	if err := r.db.WithContext(ctx).
		Where("household_id = ? AND recipe_id = ? AND status = ?", householdID, recipeID, "active").
		Order("created_at DESC").
		First(&share).Error; err != nil {
		return nil, err
	}
	return &share, nil
}

func (r *KitchenOpsRepo) FindRecipeShareByCode(ctx context.Context, shareCode string) (*RecipeShare, error) {
	var share RecipeShare
	if err := r.db.WithContext(ctx).
		Where("share_code = ? AND status = ?", shareCode, "active").
		First(&share).Error; err != nil {
		return nil, err
	}
	return &share, nil
}

func (r *KitchenOpsRepo) TouchRecipeShare(ctx context.Context, shareID int64) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&RecipeShare{}).
		Where("id = ?", shareID).
		Updates(map[string]any{
			"last_viewed_at": &now,
			"updated_at":     now,
		}).Error
}

func (r *KitchenOpsRepo) DB() *gorm.DB {
	return r.db
}

func dateOnly(value time.Time) time.Time {
	if value.IsZero() {
		return value
	}
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}
