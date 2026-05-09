package service

import (
	"context"
	"encoding/json"
	"time"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
	"github.com/chengjiang/aicook/backend/internal/data"
	kerrors "github.com/go-kratos/kratos/v2/errors"
	structpb "google.golang.org/protobuf/types/known/structpb"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"
)

type KitchenService struct {
	v1.UnimplementedKitchenServiceServer

	usecase *biz.KitchenOpsUsecase
	media   *biz.MediaUsecase
	history *biz.CookingHistoryUsecase
}

func NewKitchenService(usecase *biz.KitchenOpsUsecase, media *biz.MediaUsecase, history *biz.CookingHistoryUsecase) *KitchenService {
	return &KitchenService{usecase: usecase, media: media, history: history}
}

func requireKitchenActor(ctx context.Context) (biz.Actor, error) {
	a := biz.ActorFromContext(ctx)
	if a.HouseholdID <= 0 || a.UserID <= 0 {
		return biz.Actor{}, kerrors.Unauthorized("UNAUTHORIZED", "unauthorized")
	}
	return a, nil
}

func (s *KitchenService) GetCurrentMealPlan(ctx context.Context, req *v1.GetCurrentMealPlanRequest) (*v1.GetCurrentMealPlanReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	plan, err := s.usecase.GetWeekPlan(ctx, biz.ActorFromContext(ctx), req.GetWeekStart())
	if err != nil {
		return nil, err
	}
	p, err := mealPlanWeekViewToProto(plan)
	if err != nil {
		return nil, err
	}
	return &v1.GetCurrentMealPlanReply{Plan: p}, nil
}

func (s *KitchenService) SaveCurrentMealPlan(ctx context.Context, req *v1.SaveCurrentMealPlanRequest) (*v1.SaveCurrentMealPlanReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	days, err := daysStructToSaveInput(req.GetDays())
	if err != nil {
		return nil, err
	}
	plan, err := s.usecase.SaveWeekPlan(ctx, biz.ActorFromContext(ctx), biz.MealPlanSaveInput{
		WeekStartDate: req.GetWeekStartDate(),
		Days:          days,
	}, "manual")
	if err != nil {
		return nil, err
	}
	p, err := mealPlanWeekViewToProto(plan)
	if err != nil {
		return nil, err
	}
	return &v1.SaveCurrentMealPlanReply{Plan: p}, nil
}

func (s *KitchenService) GenerateCurrentMealPlan(ctx context.Context, req *v1.GenerateCurrentMealPlanRequest) (*v1.GenerateCurrentMealPlanReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	plan, err := s.usecase.GenerateWeekPlan(ctx, biz.ActorFromContext(ctx), req.GetWeekStart())
	if err != nil {
		return nil, err
	}
	p, err := mealPlanWeekViewToProto(plan)
	if err != nil {
		return nil, err
	}
	return &v1.GenerateCurrentMealPlanReply{Plan: p}, nil
}

func (s *KitchenService) GetCurrentShoppingList(ctx context.Context, req *v1.GetCurrentShoppingListRequest) (*v1.GetCurrentShoppingListReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	list, items, err := s.usecase.GetOrGenerateShoppingList(ctx, biz.ActorFromContext(ctx), req.GetWeekStart())
	if err != nil {
		return nil, err
	}
	return &v1.GetCurrentShoppingListReply{
		List:  toProtoShoppingListSummary(list),
		Items: toProtoShoppingListItems(items),
	}, nil
}

func (s *KitchenService) GenerateShoppingList(ctx context.Context, req *v1.GenerateShoppingListRequest) (*v1.GenerateShoppingListReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	list, items, err := s.usecase.GenerateShoppingList(ctx, biz.ActorFromContext(ctx), req.GetWeekStart())
	if err != nil {
		return nil, err
	}
	return &v1.GenerateShoppingListReply{
		List:  toProtoShoppingListSummary(list),
		Items: toProtoShoppingListItems(items),
	}, nil
}

func (s *KitchenService) PatchShoppingListItem(ctx context.Context, req *v1.PatchShoppingListItemRequest) (*v1.PatchShoppingListItemReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	patch := biz.ShoppingListItemPatch{}
	if req.Checked != nil {
		v := *req.Checked
		patch.Checked = &v
	}
	if req.Note != nil {
		patch.Note = req.Note
	}
	if req.QuantityText != nil {
		patch.QuantityText = req.QuantityText
	}
	if req.Category != nil {
		patch.Category = req.Category
	}
	item, err := s.usecase.UpdateShoppingItem(ctx, biz.ActorFromContext(ctx), req.GetListId(), req.GetItemId(), patch)
	if err != nil {
		return nil, err
	}
	return &v1.PatchShoppingListItemReply{Item: toProtoShoppingListItem(item)}, nil
}

func (s *KitchenService) CompleteShoppingList(ctx context.Context, req *v1.CompleteShoppingListRequest) (*v1.CompleteShoppingListReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	list, err := s.usecase.CompleteShoppingList(ctx, biz.ActorFromContext(ctx), req.GetListId())
	if err != nil {
		return nil, err
	}
	return &v1.CompleteShoppingListReply{List: toProtoShoppingListSummary(list)}, nil
}

func (s *KitchenService) ListInventoryItems(ctx context.Context, req *v1.ListInventoryItemsRequest) (*v1.ListInventoryItemsReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	items, err := s.usecase.ListInventory(ctx, biz.ActorFromContext(ctx), req.GetKeyword())
	if err != nil {
		return nil, err
	}
	out := make([]*v1.InventoryItem, 0, len(items))
	for _, it := range items {
		out = append(out, toProtoInventoryItem(it))
	}
	return &v1.ListInventoryItemsReply{Items: out}, nil
}

func (s *KitchenService) UpsertInventoryItems(ctx context.Context, req *v1.UpsertInventoryItemsRequest) (*v1.UpsertInventoryItemsReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	now := time.Now()
	inputs := make([]biz.InventoryInput, 0, len(req.GetItems()))
	for _, row := range req.GetItems() {
		if row == nil {
			continue
		}
		lastSeen := now
		inputs = append(inputs, biz.InventoryInput{
			ID:            row.GetId(),
			Kind:          row.GetKind(),
			Name:          row.GetName(),
			Category:      row.GetCategory(),
			QuantityValue: row.GetQuantityValue(),
			Unit:          row.GetUnit(),
			QuantityText:  row.GetQuantityText(),
			SourceType:    row.GetSourceType(),
			Confidence:    row.GetConfidence(),
			Status:        row.GetStatus(),
			LastSeenAt:    &lastSeen,
		})
	}
	items, err := s.usecase.UpsertInventory(ctx, biz.ActorFromContext(ctx), inputs)
	if err != nil {
		return nil, err
	}
	out := make([]*v1.InventoryItem, 0, len(items))
	for _, it := range items {
		out = append(out, toProtoInventoryItem(it))
	}
	return &v1.UpsertInventoryItemsReply{Items: out}, nil
}

func (s *KitchenService) PatchInventoryItem(ctx context.Context, req *v1.PatchInventoryItemRequest) (*v1.PatchInventoryItemReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	in := biz.InventoryInput{
		Kind:          req.GetKind(),
		Name:          req.GetName(),
		Category:      req.GetCategory(),
		QuantityValue: req.GetQuantityValue(),
		Unit:          req.GetUnit(),
		QuantityText:  req.GetQuantityText(),
		SourceType:    req.GetSourceType(),
		Confidence:    req.GetConfidence(),
		Status:        req.GetStatus(),
	}
	if req.ExpiresAt != nil {
		t := req.GetExpiresAt().AsTime()
		in.ExpiresAt = &t
	}
	if req.LastSeenAt != nil {
		t := req.GetLastSeenAt().AsTime()
		in.LastSeenAt = &t
	}
	item, err := s.usecase.UpdateInventory(ctx, biz.ActorFromContext(ctx), req.GetItemId(), in)
	if err != nil {
		return nil, err
	}
	return &v1.PatchInventoryItemReply{Item: toProtoInventoryItem(item)}, nil
}

func (s *KitchenService) ListInventoryRecommendations(ctx context.Context, req *v1.ListInventoryRecommendationsRequest) (*v1.ListInventoryRecommendationsReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	items, err := s.usecase.RecommendRecipesByInventory(ctx, biz.ActorFromContext(ctx), int(req.GetLimit()))
	if err != nil {
		return nil, err
	}
	out := make([]*v1.InventoryRecommendation, 0, len(items))
	for _, m := range items {
		raw, _ := m["recipe"].(*data.Recipe)
		if raw != nil && s.media != nil {
			if signed, err := s.media.SignMediaURL(ctx, raw.CoverImageURL); err == nil && signed != "" {
				raw.CoverImageURL = signed
			}
		}
		pr := toProtoRecipe(raw)
		var matched []string
		if arr, ok := m["matched_items"].([]string); ok {
			matched = arr
		}
		out = append(out, &v1.InventoryRecommendation{
			Recipe:          pr,
			MatchCount:      int32(coerceIntAny(m["match_count"])),
			IngredientTotal: int32(coerceIntAny(m["ingredient_total"])),
			MatchPercent:    int32(coerceIntAny(m["match_percent"])),
			MatchedItems:    matched,
		})
	}
	return &v1.ListInventoryRecommendationsReply{Items: out}, nil
}

func (s *KitchenService) CreateRecipeShare(ctx context.Context, req *v1.CreateRecipeShareRequest) (*v1.CreateRecipeShareReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	share, detail, err := s.usecase.CreateRecipeShare(ctx, biz.ActorFromContext(ctx), req.GetId())
	if err != nil {
		return nil, err
	}
	detailProto := toProtoRecipeDetail(detail)
	signRecipeDetailMediaURLs(ctx, s.media, detailProto)
	return &v1.CreateRecipeShareReply{
		Share: &v1.RecipeShareSummary{
			Id:        share.ID,
			ShareCode: share.ShareCode,
			Status:    share.Status,
			RecipeId:  share.RecipeID,
			ShareUrl:  "/share/recipe/" + share.ShareCode,
		},
		Detail: detailProto,
	}, nil
}

func (s *KitchenService) PreviewRecipeShare(ctx context.Context, req *v1.PreviewRecipeShareRequest) (*v1.PreviewRecipeShareReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	share, detail, err := s.usecase.PreviewRecipeShare(ctx, req.GetShareCode())
	if err != nil {
		return nil, err
	}
	detailProto := toProtoRecipeDetail(detail)
	signRecipeDetailMediaURLs(ctx, s.media, detailProto)
	return &v1.PreviewRecipeShareReply{
		Share: &v1.RecipeShareSummary{
			Id:        share.ID,
			ShareCode: share.ShareCode,
			Status:    share.Status,
			RecipeId:  share.RecipeID,
			ShareUrl:  "/share/recipe/" + share.ShareCode,
		},
		Detail: detailProto,
	}, nil
}

func (s *KitchenService) ImportRecipeShare(ctx context.Context, req *v1.ImportRecipeShareRequest) (*v1.ImportRecipeShareReply, error) {
	if _, err := requireKitchenActor(ctx); err != nil {
		return nil, err
	}
	recipe, err := s.usecase.ImportRecipeShare(ctx, biz.ActorFromContext(ctx), req.GetShareCode())
	if err != nil {
		return nil, err
	}
	r := toProtoRecipe(recipe)
	signRecipeMediaURLs(ctx, s.media, r)
	return &v1.ImportRecipeShareReply{Recipe: r}, nil
}

func (s *KitchenService) CreateCookingHistory(ctx context.Context, req *v1.CreateCookingHistoryRequest) (*v1.CreateCookingHistoryReply, error) {
	actor, err := requireKitchenActor(ctx)
	if err != nil {
		return nil, err
	}
	entry, err := s.history.Create(ctx, actor, biz.CreateInput{
		RecipeID:           req.GetRecipeId(),
		StartedAtMS:        req.GetStartedAtMs(),
		CompletedAtMS:      req.GetCompletedAtMs(),
		DurationSeconds:    int(req.GetDurationSeconds()),
		CompletedStepCount: int(req.GetCompletedStepCount()),
		Rating:             int(req.GetRating()),
		Note:               req.GetNote(),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateCookingHistoryReply{Entry: s.toProtoCookingHistoryEntry(ctx, entry)}, nil
}

func (s *KitchenService) ListCookingHistory(ctx context.Context, req *v1.ListCookingHistoryRequest) (*v1.ListCookingHistoryReply, error) {
	actor, err := requireKitchenActor(ctx)
	if err != nil {
		return nil, err
	}
	limit := int(req.GetLimit())
	entries, nextCursor, err := s.history.List(ctx, actor, limit, req.GetBeforeId())
	if err != nil {
		return nil, err
	}
	out := make([]*v1.CookingHistoryEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, s.toProtoCookingHistoryEntry(ctx, e))
	}
	return &v1.ListCookingHistoryReply{Entries: out, NextCursorId: nextCursor}, nil
}

func (s *KitchenService) ListRecentCookingHistory(ctx context.Context, req *v1.ListRecentCookingHistoryRequest) (*v1.ListRecentCookingHistoryReply, error) {
	actor, err := requireKitchenActor(ctx)
	if err != nil {
		return nil, err
	}
	entries, err := s.history.ListRecent(ctx, actor, int(req.GetLimit()))
	if err != nil {
		return nil, err
	}
	out := make([]*v1.CookingHistoryEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, s.toProtoCookingHistoryEntry(ctx, e))
	}
	return &v1.ListRecentCookingHistoryReply{Entries: out}, nil
}

func (s *KitchenService) toProtoCookingHistoryEntry(ctx context.Context, entry *data.CookingHistory) *v1.CookingHistoryEntry {
	if entry == nil {
		return nil
	}
	cover := entry.RecipeCoverSnapshot
	// 封面是私有桶 URL，前端无法直链访问，统一替换为短期签名 URL。
	if cover != "" && s.media != nil {
		if signed, err := s.media.SignMediaURL(ctx, cover); err == nil && signed != "" {
			cover = signed
		}
	}
	return &v1.CookingHistoryEntry{
		Id:                  entry.ID,
		HouseholdId:         entry.HouseholdID,
		UserId:              entry.UserID,
		RecipeId:            entry.RecipeID,
		RecipeTitleSnapshot: entry.RecipeTitleSnapshot,
		RecipeCoverSnapshot: cover,
		StartedAt:           timestampFromTimePtr(entry.StartedAt),
		CompletedAt:         toTimestampPtr(entry.CompletedAt),
		DurationSeconds:     int32(entry.DurationSeconds),
		CompletedStepCount:  int32(entry.CompletedStepCount),
		Rating:              int32(entry.Rating),
		Note:                entry.Note,
		CreatedAt:           toTimestampPtr(entry.CreatedAt),
	}
}

func mealPlanWeekViewToProto(v *biz.MealPlanWeekView) (*v1.MealPlanWeek, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v.Days)
	if err != nil {
		return nil, err
	}
	var top map[string]any
	if err := json.Unmarshal(b, &top); err != nil {
		return nil, err
	}
	daysSt, err := structpb.NewStruct(top)
	if err != nil {
		return nil, err
	}
	return &v1.MealPlanWeek{
		Id:            v.ID,
		WeekStartDate: v.WeekStartDate,
		Timezone:      v.Timezone,
		Source:        v.Source,
		Days:          daysSt,
	}, nil
}

func daysStructToSaveInput(st *structpb.Struct) (map[string]map[biz.MealSlot][]biz.MealPlanDishInput, error) {
	if st == nil {
		return nil, nil
	}
	b, err := json.Marshal(st.AsMap())
	if err != nil {
		return nil, err
	}
	var raw map[string]map[string][]struct {
		RecipeID    *int64 `json:"recipe_id"`
		RecipeTitle string `json:"recipe_title"`
		Note        string `json:"note"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, err
	}
	out := make(map[string]map[biz.MealSlot][]biz.MealPlanDishInput, len(raw))
	for day, slots := range raw {
		out[day] = make(map[biz.MealSlot][]biz.MealPlanDishInput)
		for slot, dishes := range slots {
			ms := biz.MealSlot(slot)
			inputs := make([]biz.MealPlanDishInput, 0, len(dishes))
			for _, d := range dishes {
				inputs = append(inputs, biz.MealPlanDishInput{
					RecipeID:    d.RecipeID,
					RecipeTitle: d.RecipeTitle,
					Note:        d.Note,
				})
			}
			out[day][ms] = inputs
		}
	}
	return out, nil
}

func toProtoShoppingListSummary(list *data.ShoppingList) *v1.ShoppingList {
	if list == nil {
		return nil
	}
	var mealPlanID *int64
	if list.MealPlanID != nil {
		v := *list.MealPlanID
		mealPlanID = &v
	}
	return &v1.ShoppingList{
		Id:            list.ID,
		MealPlanId:    mealPlanID,
		WeekStartDate: list.WeekStartDate.Format("2006-01-02"),
		Status:        list.Status,
		CompletedAt:   timestampFromTimePtr(list.CompletedAt),
	}
}

func toProtoShoppingListItem(item *data.ShoppingListItem) *v1.ShoppingListItem {
	if item == nil {
		return nil
	}
	var srcRecipe *int64
	if item.SourceRecipeID != nil {
		v := *item.SourceRecipeID
		srcRecipe = &v
	}
	return &v1.ShoppingListItem{
		Id:                    item.ID,
		ShoppingListId:        item.ShoppingListID,
		SortOrder:             int32(item.SortOrder),
		SourceType:            item.SourceType,
		SourceRecipeId:        srcRecipe,
		SourceRecipeTitle:     item.SourceRecipeTitle,
		IngredientName:        item.IngredientName,
		NormalizedName:        item.NormalizedName,
		Category:              item.Category,
		RequiredQuantityValue: item.RequiredQuantityValue,
		RequiredUnit:          item.RequiredUnit,
		RequiredText:          item.RequiredText,
		MissingQuantityValue:  item.MissingQuantityValue,
		MissingText:           item.MissingText,
		Checked:               item.Checked,
		Note:                  item.Note,
	}
}

func toProtoShoppingListItems(items []*data.ShoppingListItem) []*v1.ShoppingListItem {
	out := make([]*v1.ShoppingListItem, 0, len(items))
	for _, it := range items {
		out = append(out, toProtoShoppingListItem(it))
	}
	return out
}

func toProtoInventoryItem(item *data.InventoryItem) *v1.InventoryItem {
	if item == nil {
		return nil
	}
	return &v1.InventoryItem{
		Id:             item.ID,
		HouseholdId:    item.HouseholdID,
		Kind:           item.Kind,
		Name:           item.Name,
		NormalizedName: item.NormalizedName,
		Category:       item.Category,
		QuantityValue:  item.QuantityValue,
		Unit:           item.Unit,
		QuantityText:   item.QuantityText,
		SourceType:     item.SourceType,
		Confidence:     item.Confidence,
		Status:         item.Status,
		ExpiresAt:      timestampFromTimePtr(item.ExpiresAt),
		LastSeenAt:     timestampFromTimePtr(item.LastSeenAt),
		CreatedAt:      toTimestampPtr(item.CreatedAt),
		UpdatedAt:      toTimestampPtr(item.UpdatedAt),
	}
}

func timestampFromTimePtr(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return timestamppb.New(*t)
}

func toTimestampPtr(t time.Time) *timestamppb.Timestamp {
	if t.IsZero() {
		return nil
	}
	return timestamppb.New(t)
}

func coerceIntAny(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int32:
		return int(x)
	case int64:
		return int(x)
	case float64:
		return int(x)
	default:
		return 0
	}
}

