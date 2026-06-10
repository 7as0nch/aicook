package kitchen

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/utils"
)

type MealSlot string

const (
	MealSlotBreakfast MealSlot = "breakfast"
	MealSlotLunch     MealSlot = "lunch"
	MealSlotDinner    MealSlot = "dinner"
)

type MealPlanDishInput struct {
	RecipeID    *int64
	RecipeTitle string
	Note        string
}

type MealPlanSaveInput struct {
	WeekStartDate string
	Days          map[string]map[MealSlot][]MealPlanDishInput
}

type MealPlanDish struct {
	ID           int64             `json:"id"`
	RecipeID     *int64            `json:"recipe_id,omitempty"`
	RecipeTitle  string            `json:"recipe_title"`
	Note         string            `json:"note,omitempty"`
	MetadataJSON datatypes.JSONMap `json:"metadata_json,omitempty"`
}

type MealPlanWeekView struct {
	ID            int64                                 `json:"id"`
	WeekStartDate string                                `json:"week_start_date"`
	Timezone      string                                `json:"timezone"`
	Source        string                                `json:"source"`
	Days          map[string]map[MealSlot][]MealPlanDish `json:"days"`
}

type ShoppingListItemPatch struct {
	Checked      *bool
	Note         *string
	QuantityText *string
	Category     *string
}

type InventoryInput struct {
	ID           int64
	Kind         string
	Name         string
	Category     string
	QuantityValue float64
	Unit         string
	QuantityText string
	SourceType   string
	Confidence   float64
	Status       string
	ExpiresAt    *time.Time
	LastSeenAt   *time.Time
}

type KitchenOpsUsecase struct {
	repo         *data.KitchenOpsRepo
	recipeRepo   *data.RecipeRepo
	householdRepo *data.HouseholdRepo
}

func NewKitchenOpsUsecase(repo *data.KitchenOpsRepo, recipeRepo *data.RecipeRepo, householdRepo *data.HouseholdRepo) *KitchenOpsUsecase {
	return &KitchenOpsUsecase{
		repo:          repo,
		recipeRepo:    recipeRepo,
		householdRepo: householdRepo,
	}
}

func (u *KitchenOpsUsecase) GetWeekPlan(ctx context.Context, actor common.Actor, weekStartRaw string) (*MealPlanWeekView, error) {
	weekStart, err := parseWeekStart(weekStartRaw)
	if err != nil {
		return nil, err
	}
	plan, items, err := u.repo.GetMealPlanByWeek(ctx, actor.HouseholdID, weekStart)
	if err != nil {
		return nil, err
	}
	return buildMealPlanView(plan, items, weekStart), nil
}

func (u *KitchenOpsUsecase) SaveWeekPlan(ctx context.Context, actor common.Actor, input MealPlanSaveInput, source string) (*MealPlanWeekView, error) {
	weekStart, err := parseWeekStart(input.WeekStartDate)
	if err != nil {
		return nil, err
	}
	plan := &data.MealPlan{
		HouseholdID:   actor.HouseholdID,
		WeekStartDate: weekStart,
		Timezone:      "Asia/Shanghai",
		Source:        fallbackString(source, "manual"),
		MetadataJSON:  datatypes.JSONMap{},
	}
	items := make([]*data.MealPlanItem, 0)
	for dayKey, slots := range input.Days {
		planDate, ok := dateForDayKey(weekStart, dayKey)
		if !ok {
			continue
		}
		for slot, dishes := range slots {
			if !validMealSlot(slot) {
				continue
			}
			for idx, dish := range dishes {
				title := strings.TrimSpace(dish.RecipeTitle)
				if dish.RecipeID == nil && title == "" {
					continue
				}
				items = append(items, &data.MealPlanItem{
					HouseholdID:         actor.HouseholdID,
					PlanDate:            planDate,
					MealSlot:            string(slot),
					SortOrder:           idx + 1,
					RecipeID:            dish.RecipeID,
					RecipeTitleSnapshot: title,
					Note:                strings.TrimSpace(dish.Note),
					MetadataJSON:        datatypes.JSONMap{},
				})
			}
		}
	}
	if err := u.repo.SaveMealPlanWithItems(ctx, plan, items); err != nil {
		return nil, err
	}
	return buildMealPlanView(plan, items, weekStart), nil
}

func (u *KitchenOpsUsecase) GenerateWeekPlan(ctx context.Context, actor common.Actor, weekStartRaw string) (*MealPlanWeekView, error) {
	weekStart, err := parseWeekStart(weekStartRaw)
	if err != nil {
		return nil, err
	}
	recipes, err := u.recipeRepo.ListLatest(ctx, actor.HouseholdID, 30, "", "", true, "published")
	if err != nil {
		return nil, err
	}
	dayKeys := orderedDayKeys()
	slotOrder := []MealSlot{MealSlotBreakfast, MealSlotLunch, MealSlotDinner}
	input := MealPlanSaveInput{
		WeekStartDate: weekStart.Format(dateLayout),
		Days:          map[string]map[MealSlot][]MealPlanDishInput{},
	}
	cursor := 0
	for _, dayKey := range dayKeys {
		input.Days[dayKey] = map[MealSlot][]MealPlanDishInput{}
		for _, slot := range slotOrder {
			if len(recipes) == 0 {
				input.Days[dayKey][slot] = []MealPlanDishInput{}
				continue
			}
			recipe := recipes[cursor%len(recipes)]
			input.Days[dayKey][slot] = []MealPlanDishInput{{
				RecipeID:    &recipe.ID,
				RecipeTitle: recipe.Title,
			}}
			cursor++
		}
	}
	return u.SaveWeekPlan(ctx, actor, input, "ai")
}

func (u *KitchenOpsUsecase) GetOrGenerateShoppingList(ctx context.Context, actor common.Actor, weekStartRaw string) (*data.ShoppingList, []*data.ShoppingListItem, error) {
	weekStart, err := parseWeekStart(weekStartRaw)
	if err != nil {
		return nil, nil, err
	}
	list, items, err := u.repo.GetShoppingListByWeek(ctx, actor.HouseholdID, weekStart)
	if err != nil {
		return nil, nil, err
	}
	if list != nil {
		return list, items, nil
	}
	return u.GenerateShoppingList(ctx, actor, weekStartRaw)
}

func (u *KitchenOpsUsecase) GenerateShoppingList(ctx context.Context, actor common.Actor, weekStartRaw string) (*data.ShoppingList, []*data.ShoppingListItem, error) {
	weekStart, err := parseWeekStart(weekStartRaw)
	if err != nil {
		return nil, nil, err
	}
	plan, items, err := u.repo.GetMealPlanByWeek(ctx, actor.HouseholdID, weekStart)
	if err != nil {
		return nil, nil, err
	}
	if plan == nil {
		return nil, nil, fmt.Errorf("meal plan not found")
	}
	inventory, err := u.repo.ListInventory(ctx, actor.HouseholdID, "")
	if err != nil {
		return nil, nil, err
	}
	inventoryNames := make(map[string]*data.InventoryItem, len(inventory))
	for _, item := range inventory {
		if item == nil || item.Status == "archived" || item.Status == "used_up" {
			continue
		}
		inventoryNames[item.NormalizedName] = item
	}
	shoppingItems := make([]*data.ShoppingListItem, 0)
	sortOrder := 1
	for _, entry := range items {
		if entry == nil || entry.RecipeID == nil || *entry.RecipeID <= 0 {
			continue
		}
		detail, err := u.recipeRepo.GetDetail(ctx, actor.HouseholdID, *entry.RecipeID)
		if err != nil {
			continue
		}
		for _, ing := range detail.Ingredients {
			if ing == nil {
				continue
			}
			name := strings.TrimSpace(ing.Name)
			if name == "" {
				continue
			}
			normalized := normalizeIngredientName(name)
			if _, ok := inventoryNames[normalized]; ok {
				continue
			}
			shoppingItems = append(shoppingItems, &data.ShoppingListItem{
				HouseholdID:       actor.HouseholdID,
				SortOrder:         sortOrder,
				SourceType:        "plan_gap",
				SourceRecipeID:    entry.RecipeID,
				SourceRecipeTitle: entry.RecipeTitleSnapshot,
				IngredientName:    name,
				NormalizedName:    normalized,
				Category:          strings.TrimSpace(ing.GroupName),
				RequiredText:      fallbackString(strings.TrimSpace(ing.AmountText), "适量"),
				MissingText:       fallbackString(strings.TrimSpace(ing.AmountText), "适量"),
				MetadataJSON:      datatypes.JSONMap{},
			})
			sortOrder++
		}
	}
	list := &data.ShoppingList{
		HouseholdID:   actor.HouseholdID,
		MealPlanID:    refInt64(plan.ID),
		WeekStartDate: weekStart,
		Status:        "draft",
		MetadataJSON:  datatypes.JSONMap{},
	}
	if err := u.repo.SaveShoppingListWithItems(ctx, list, shoppingItems); err != nil {
		return nil, nil, err
	}
	return list, shoppingItems, nil
}

func (u *KitchenOpsUsecase) UpdateShoppingItem(ctx context.Context, actor common.Actor, listID, itemID int64, patch ShoppingListItemPatch) (*data.ShoppingListItem, error) {
	updates := map[string]any{}
	if patch.Checked != nil {
		updates["checked"] = *patch.Checked
	}
	if patch.Note != nil {
		updates["note"] = strings.TrimSpace(*patch.Note)
	}
	if patch.QuantityText != nil {
		value := strings.TrimSpace(*patch.QuantityText)
		updates["required_text"] = value
		updates["missing_text"] = value
	}
	if patch.Category != nil {
		updates["category"] = strings.TrimSpace(*patch.Category)
	}
	if len(updates) == 0 {
		return nil, fmt.Errorf("no updates provided")
	}
	return u.repo.UpdateShoppingListItem(ctx, actor.HouseholdID, listID, itemID, updates)
}

func (u *KitchenOpsUsecase) CompleteShoppingList(ctx context.Context, actor common.Actor, listID int64) (*data.ShoppingList, error) {
	current, currentItems, err := u.repo.FindShoppingListByID(ctx, actor.HouseholdID, listID)
	if err != nil {
		return nil, err
	}
	inventoryItems := make([]*data.InventoryItem, 0)
	now := time.Now()
	for _, item := range currentItems {
		if item == nil || !item.Checked {
			continue
		}
		inventoryItems = append(inventoryItems, &data.InventoryItem{
			HouseholdID:    actor.HouseholdID,
			Kind:           inferInventoryKind(item.Category),
			Name:           item.IngredientName,
			NormalizedName: item.NormalizedName,
			Category:       item.Category,
			QuantityText:   fallbackString(item.MissingText, item.RequiredText),
			SourceType:     "shopping",
			Confidence:     1,
			Status:         "active",
			LastSeenAt:     &now,
			MetadataJSON:   datatypes.JSONMap{"shopping_list_id": listID},
		})
	}
	return u.repo.CompleteShoppingList(ctx, actor.HouseholdID, current.ID, inventoryItems)
}

func (u *KitchenOpsUsecase) ListInventory(ctx context.Context, actor common.Actor, keyword string) ([]*data.InventoryItem, error) {
	return u.repo.ListInventory(ctx, actor.HouseholdID, keyword)
}

func (u *KitchenOpsUsecase) UpsertInventory(ctx context.Context, actor common.Actor, inputs []InventoryInput) ([]*data.InventoryItem, error) {
	items := make([]*data.InventoryItem, 0, len(inputs))
	now := time.Now()
	for _, input := range inputs {
		name := strings.TrimSpace(input.Name)
		if name == "" {
			continue
		}
		items = append(items, &data.InventoryItem{
			BaseModel:      data.BaseModel{ID: input.ID},
			HouseholdID:    actor.HouseholdID,
			Kind:           fallbackString(input.Kind, "ingredient"),
			Name:           name,
			NormalizedName: normalizeIngredientName(name),
			Category:       strings.TrimSpace(input.Category),
			QuantityValue:  input.QuantityValue,
			Unit:           strings.TrimSpace(input.Unit),
			QuantityText:   strings.TrimSpace(input.QuantityText),
			SourceType:     fallbackString(input.SourceType, "manual"),
			Confidence:     fallbackFloat(input.Confidence, 1),
			Status:         fallbackString(input.Status, "active"),
			ExpiresAt:      input.ExpiresAt,
			LastSeenAt:     fallbackTimePtr(input.LastSeenAt, &now),
			MetadataJSON:   datatypes.JSONMap{},
		})
	}
	if err := u.repo.UpsertInventoryItems(ctx, items); err != nil {
		return nil, err
	}
	return u.repo.ListInventory(ctx, actor.HouseholdID, "")
}

func (u *KitchenOpsUsecase) UpdateInventory(ctx context.Context, actor common.Actor, itemID int64, input InventoryInput) (*data.InventoryItem, error) {
	updates := map[string]any{
		"kind":            fallbackString(input.Kind, "ingredient"),
		"name":            strings.TrimSpace(input.Name),
		"normalized_name": normalizeIngredientName(input.Name),
		"category":        strings.TrimSpace(input.Category),
		"quantity_value":  input.QuantityValue,
		"unit":            strings.TrimSpace(input.Unit),
		"quantity_text":   strings.TrimSpace(input.QuantityText),
		"source_type":     fallbackString(input.SourceType, "manual"),
		"confidence":      fallbackFloat(input.Confidence, 1),
		"status":          fallbackString(input.Status, "active"),
		"expires_at":      input.ExpiresAt,
		"last_seen_at":    input.LastSeenAt,
	}
	return u.repo.UpdateInventoryItem(ctx, actor.HouseholdID, itemID, updates)
}

func (u *KitchenOpsUsecase) RecommendRecipesByInventory(ctx context.Context, actor common.Actor, limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 12
	}
	inventory, err := u.repo.ListInventory(ctx, actor.HouseholdID, "")
	if err != nil {
		return nil, err
	}
	names := map[string]struct{}{}
	for _, item := range inventory {
		if item == nil || item.Status != "active" {
			continue
		}
		names[item.NormalizedName] = struct{}{}
	}
	recipes, err := u.recipeRepo.ListLatest(ctx, actor.HouseholdID, 40, "", "", true, "published")
	if err != nil {
		return nil, err
	}
	type scored struct {
		recipe  *data.Recipe
		score   int
		total   int
		matched []string
	}
	scoredRecipes := make([]scored, 0, len(recipes))
	for _, recipe := range recipes {
		detail, err := u.recipeRepo.GetDetail(ctx, actor.HouseholdID, recipe.ID)
		if err != nil {
			continue
		}
		matchCount := 0
		matched := make([]string, 0)
		for _, ing := range detail.Ingredients {
			if ing == nil {
				continue
			}
			name := normalizeIngredientName(ing.Name)
			if _, ok := names[name]; ok {
				matchCount++
				matched = append(matched, ing.Name)
			}
		}
		scoredRecipes = append(scoredRecipes, scored{recipe: recipe, score: matchCount, total: len(detail.Ingredients), matched: matched})
	}
	sort.SliceStable(scoredRecipes, func(i, j int) bool {
		if scoredRecipes[i].score == scoredRecipes[j].score {
			return scoredRecipes[i].recipe.CreatedAt.After(scoredRecipes[j].recipe.CreatedAt)
		}
		return scoredRecipes[i].score > scoredRecipes[j].score
	})
	out := make([]map[string]any, 0, min(limit, len(scoredRecipes)))
	for _, item := range scoredRecipes {
		if len(out) >= limit {
			break
		}
		percent := 0
		if item.total > 0 {
			percent = int(float64(item.score) / float64(item.total) * 100)
		}
		out = append(out, map[string]any{
			"recipe":         item.recipe,
			"match_count":    item.score,
			"ingredient_total": item.total,
			"match_percent":  percent,
			"matched_items":  item.matched,
		})
	}
	return out, nil
}

func (u *KitchenOpsUsecase) CreateRecipeShare(ctx context.Context, actor common.Actor, recipeID int64) (*data.RecipeShare, *data.RecipeDetail, error) {
	detail, err := u.recipeRepo.GetDetail(ctx, actor.HouseholdID, recipeID)
	if err != nil {
		return nil, nil, err
	}
	share, err := u.repo.FindRecipeShareByRecipe(ctx, actor.HouseholdID, recipeID)
	if err == nil && share != nil {
		return share, detail, nil
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, nil, err
	}
	share = &data.RecipeShare{
		HouseholdID:     actor.HouseholdID,
		RecipeID:        recipeID,
		CreatedByUserID: actor.UserID,
		ShareCode:       utils.GetSFIDBase62(),
		Status:          "active",
		MetadataJSON:    datatypes.JSONMap{},
	}
	if err := u.repo.CreateRecipeShare(ctx, share); err != nil {
		return nil, nil, err
	}
	return share, detail, nil
}

func (u *KitchenOpsUsecase) PreviewRecipeShare(ctx context.Context, shareCode string) (*data.RecipeShare, *data.RecipeDetail, error) {
	share, err := u.repo.FindRecipeShareByCode(ctx, strings.TrimSpace(shareCode))
	if err != nil {
		return nil, nil, err
	}
	if err := u.repo.TouchRecipeShare(ctx, share.ID); err != nil {
		return nil, nil, err
	}
	detail, err := u.recipeRepo.GetDetail(ctx, share.HouseholdID, share.RecipeID)
	if err != nil {
		return nil, nil, err
	}
	return share, detail, nil
}

func (u *KitchenOpsUsecase) ImportRecipeShare(ctx context.Context, actor common.Actor, shareCode string) (*data.Recipe, error) {
	share, err := u.repo.FindRecipeShareByCode(ctx, strings.TrimSpace(shareCode))
	if err != nil {
		return nil, err
	}
	if share.HouseholdID == actor.HouseholdID {
		return nil, fmt.Errorf("cannot import from current household")
	}
	recipes, err := u.householdRepo.ImportRecipes(ctx, share.HouseholdID, actor.HouseholdID, actor.UserID, []int64{share.RecipeID}, "分享导入")
	if err != nil {
		return nil, err
	}
	if len(recipes) == 0 {
		return nil, fmt.Errorf("recipe share import failed")
	}
	return recipes[0], nil
}

func buildMealPlanView(plan *data.MealPlan, items []*data.MealPlanItem, weekStart time.Time) *MealPlanWeekView {
	view := &MealPlanWeekView{
		ID:            0,
		WeekStartDate: weekStart.Format(dateLayout),
		Timezone:      "Asia/Shanghai",
		Source:        "manual",
		Days:          emptyMealPlanDays(weekStart),
	}
	if plan != nil {
		view.ID = plan.ID
		view.Timezone = plan.Timezone
		view.Source = plan.Source
		view.WeekStartDate = plan.WeekStartDate.Format(dateLayout)
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		dayKey := dayKeyForDate(weekStart, item.PlanDate)
		if dayKey == "" {
			continue
		}
		slot := MealSlot(item.MealSlot)
		view.Days[dayKey][slot] = append(view.Days[dayKey][slot], MealPlanDish{
			ID:          item.ID,
			RecipeID:    item.RecipeID,
			RecipeTitle: item.RecipeTitleSnapshot,
			Note:        item.Note,
			MetadataJSON: item.MetadataJSON,
		})
	}
	return view
}

func emptyMealPlanDays(weekStart time.Time) map[string]map[MealSlot][]MealPlanDish {
	days := map[string]map[MealSlot][]MealPlanDish{}
	for _, key := range orderedDayKeys() {
		days[key] = map[MealSlot][]MealPlanDish{
			MealSlotBreakfast: {},
			MealSlotLunch:     {},
			MealSlotDinner:    {},
		}
	}
	return days
}

func orderedDayKeys() []string {
	return []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
}

const dateLayout = "2006-01-02"

func parseWeekStart(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	var start time.Time
	var err error
	if raw == "" {
		now := time.Now()
		offset := (int(now.Weekday()) + 6) % 7
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -offset)
	} else {
		start, err = time.Parse(dateLayout, raw)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid week_start_date")
		}
		start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	}
	if start.Weekday() != time.Monday {
		offset := (int(start.Weekday()) + 6) % 7
		start = start.AddDate(0, 0, -offset)
	}
	return start, nil
}

func dateForDayKey(weekStart time.Time, dayKey string) (time.Time, bool) {
	for idx, key := range orderedDayKeys() {
		if key == dayKey {
			return weekStart.AddDate(0, 0, idx), true
		}
	}
	return time.Time{}, false
}

func dayKeyForDate(weekStart, value time.Time) string {
	for idx, key := range orderedDayKeys() {
		if weekStart.AddDate(0, 0, idx).Format(dateLayout) == value.Format(dateLayout) {
			return key
		}
	}
	return ""
}

func validMealSlot(slot MealSlot) bool {
	return slot == MealSlotBreakfast || slot == MealSlotLunch || slot == MealSlotDinner
}

func normalizeIngredientName(value string) string {
	replacer := strings.NewReplacer("　", "", " ", "", "（", "", "）", "", "(", "", ")", "", "、", "")
	return strings.ToLower(replacer.Replace(strings.TrimSpace(value)))
}

func fallbackString(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func fallbackFloat(value, fallback float64) float64 {
	if value <= 0 {
		return fallback
	}
	return value
}

func fallbackTimePtr(value, fallback *time.Time) *time.Time {
	if value != nil {
		return value
	}
	return fallback
}

func refInt64(value int64) *int64 {
	return &value
}

func inferInventoryKind(category string) string {
	category = strings.TrimSpace(category)
	if strings.Contains(category, "调") || strings.Contains(category, "料") {
		return "seasoning"
	}
	return "ingredient"
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
