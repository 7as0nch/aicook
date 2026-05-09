package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	apierrors "github.com/chengjiang/aicook/backend/api/aicook/errors"
	"github.com/chengjiang/aicook/backend/internal/data"
	"gorm.io/gorm"
)

// CookingHistoryUsecase 负责"做过的菜"历史的写入与读取。
type CookingHistoryUsecase struct {
	histories *data.CookingHistoryRepo
	recipes   *data.RecipeRepo
	progress  *CookingProgressUsecase
}

func NewCookingHistoryUsecase(histories *data.CookingHistoryRepo, recipes *data.RecipeRepo, progress *CookingProgressUsecase) *CookingHistoryUsecase {
	return &CookingHistoryUsecase{histories: histories, recipes: recipes, progress: progress}
}

// CreateInput 描述前端在烹饪完成时上报的字段；时间字段使用 Unix 毫秒方便跨端处理。
type CreateInput struct {
	RecipeID           int64
	StartedAtMS        int64
	CompletedAtMS      int64
	DurationSeconds    int
	CompletedStepCount int
	Rating             int
	Note               string
}

// Create 写入一条历史；当菜谱不存在或不属于当前 household 时返回 NotFound。
// 写入成功后会顺带删除对应的 active cooking 记录（避免首页"正在做"与"做过"同时出现）。
func (u *CookingHistoryUsecase) Create(ctx context.Context, actor Actor, input CreateInput) (*data.CookingHistory, error) {
	if input.RecipeID <= 0 {
		return nil, apierrors.ErrorInvalidId("recipe id")
	}

	detail, err := u.recipes.GetDetail(ctx, actor.HouseholdID, input.RecipeID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierrors.ErrorNotFound("recipe not found")
		}
		return nil, err
	}

	now := time.Now()
	completedAt := now
	if input.CompletedAtMS > 0 {
		completedAt = time.UnixMilli(input.CompletedAtMS)
	}
	var startedAt *time.Time
	if input.StartedAtMS > 0 {
		t := time.UnixMilli(input.StartedAtMS)
		startedAt = &t
	}
	duration := input.DurationSeconds
	if duration < 0 {
		duration = 0
	}
	if duration == 0 && startedAt != nil {
		// 兜底：前端没传时长但能算出来，就自动算。
		if diff := completedAt.Sub(*startedAt).Seconds(); diff > 0 {
			duration = int(diff)
		}
	}
	stepCount := input.CompletedStepCount
	if stepCount < 0 {
		stepCount = 0
	}
	if stepCount == 0 && detail != nil {
		stepCount = len(detail.Steps)
	}
	rating := input.Rating
	if rating < 0 {
		rating = 0
	}
	if rating > 5 {
		rating = 5
	}

	entry := &data.CookingHistory{
		HouseholdID:         actor.HouseholdID,
		UserID:              actor.UserID,
		RecipeID:            input.RecipeID,
		RecipeTitleSnapshot: snapshotTitle(detail),
		RecipeCoverSnapshot: snapshotCover(detail),
		StartedAt:           startedAt,
		CompletedAt:         completedAt,
		DurationSeconds:     duration,
		CompletedStepCount:  stepCount,
		Rating:              rating,
		Note:                strings.TrimSpace(input.Note),
	}
	if err := u.histories.Create(ctx, entry); err != nil {
		return nil, err
	}

	// 烹饪已完成，主动清理正在做菜状态；失败不影响主流程。
	if u.progress != nil {
		_ = u.progress.Delete(ctx, actor, input.RecipeID)
	}

	return entry, nil
}

// List 返回当前用户的历史，使用游标分页。
func (u *CookingHistoryUsecase) List(ctx context.Context, actor Actor, limit int, beforeID int64) ([]*data.CookingHistory, int64, error) {
	items, err := u.histories.ListByUser(ctx, actor.UserID, limit, beforeID)
	if err != nil {
		return nil, 0, err
	}
	var nextCursor int64
	if len(items) > 0 && (limit > 0 && len(items) >= limit) {
		nextCursor = items[len(items)-1].ID
	}
	return items, nextCursor, nil
}

// ListRecent 取最近做过的 N 条用于首页展示。
func (u *CookingHistoryUsecase) ListRecent(ctx context.Context, actor Actor, limit int) ([]*data.CookingHistory, error) {
	return u.histories.ListRecentForUser(ctx, actor.UserID, limit)
}

// ListRecentRecipeIDs 供推荐算法做"最近做过降权"使用，返回最近 withinDays 天内做过的菜谱 id（去重）。
func (u *CookingHistoryUsecase) ListRecentRecipeIDs(ctx context.Context, actor Actor, withinDays int, limit int) ([]int64, error) {
	return u.histories.ListRecentRecipeIDsForUser(ctx, actor.UserID, withinDays, limit)
}

func snapshotTitle(detail *data.RecipeDetail) string {
	if detail == nil || detail.Recipe == nil {
		return ""
	}
	return strings.TrimSpace(detail.Recipe.Title)
}

func snapshotCover(detail *data.RecipeDetail) string {
	if detail == nil || detail.Recipe == nil {
		return ""
	}
	return strings.TrimSpace(detail.Recipe.CoverImageURL)
}
