package biz

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	apierrors "github.com/chengjiang/aicook/backend/api/aicook/errors"
	"github.com/chengjiang/aicook/backend/internal/consts"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	kerrors "github.com/go-kratos/kratos/v2/errors"
	"gorm.io/gorm"
)

type CookingProgressUsecase struct {
	recipes *data.RecipeRepo
	store   *data.CookingProgressStore
}

func NewCookingProgressUsecase(recipes *data.RecipeRepo, store *data.CookingProgressStore) *CookingProgressUsecase {
	return &CookingProgressUsecase{recipes: recipes, store: store}
}

type CookingActiveItem struct {
	RecipeID            int64
	Title               string
	CoverImageURL       string
	StepIndex           int32
	TotalSteps          int32
	TimerTotalSeconds   int32
	RemainingSeconds    int32
	UpdatedAtMS         int64
	TimerRunning        bool
}

func redisUnavailable(err error) error {
	if errors.Is(err, data.ErrRedisUnavailable) {
		return kerrors.New(503, "REDIS_UNAVAILABLE", "缓存不可用，请稍后重试")
	}
	return err
}

func (u *CookingProgressUsecase) Upsert(ctx context.Context, actor Actor, recipeID int64, stepIndex, totalSteps int32, timerTotal int32, timerStartedAtMS int64, timerPausedRemaining int32) (*CookingActiveItem, error) {
	if recipeID <= 0 {
		return nil, apierrors.ErrorInvalidId("recipe id")
	}
	if u.store == nil {
		return nil, redisUnavailable(data.ErrRedisUnavailable)
	}

	detail, err := u.recipes.GetDetail(ctx, actor.HouseholdID, recipeID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierrors.ErrorNotFound("recipe not found")
		}
		return nil, err
	}
	dbSteps := int32(len(detail.Steps))
	if dbSteps < 1 {
		return nil, apierrors.ErrorBadRequest("recipe has no steps")
	}
	if stepIndex < 0 || stepIndex >= dbSteps {
		return nil, apierrors.ErrorBadRequest("step_index out of range")
	}
	// Trust DB for total_steps display
	totalSteps = dbSteps
	if timerTotal < 0 {
		timerTotal = 0
	}
	if timerStartedAtMS < 0 {
		timerStartedAtMS = 0
	}
	if timerPausedRemaining < 0 {
		timerPausedRemaining = 0
	}

	nowMs := time.Now().UnixMilli()
	existing, err := u.store.ListAll(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	_, has := existing[recipeID]
	if !has && len(existing) >= consts.MaxActiveCooking {
		var evictID int64
		var evictAt int64 = -1
		for rid, rrec := range existing {
			if evictAt < 0 || rrec.UpdatedAtMS < evictAt || (rrec.UpdatedAtMS == evictAt && rid < evictID) {
				evictAt = rrec.UpdatedAtMS
				evictID = rid
			}
		}
		if evictID > 0 {
			if err := u.store.Delete(ctx, actor.UserID, evictID); err != nil {
				return nil, redisUnavailable(err)
			}
		}
	}

	rec := data.CookingProgressRecord{
		StepIndex:             int(stepIndex),
		TotalSteps:            int(totalSteps),
		TimerTotalSeconds:     int(timerTotal),
		TimerStartedAtMS:      timerStartedAtMS,
		TimerPausedRemaining: int(timerPausedRemaining),
		UpdatedAtMS:           nowMs,
	}
	if err := u.store.Set(ctx, actor.UserID, recipeID, rec); err != nil {
		return nil, redisUnavailable(err)
	}

	return u.buildItem(recipeID, rec, detail), nil
}

func (u *CookingProgressUsecase) Delete(ctx context.Context, actor Actor, recipeID int64) error {
	if recipeID <= 0 {
		return apierrors.ErrorInvalidId("recipe id")
	}
	if _, err := u.recipes.GetDetail(ctx, actor.HouseholdID, recipeID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apierrors.ErrorNotFound("recipe not found")
		}
		return err
	}
	if err := u.store.Delete(ctx, actor.UserID, recipeID); err != nil {
		return redisUnavailable(err)
	}
	return nil
}

func (u *CookingProgressUsecase) List(ctx context.Context, actor Actor) ([]*CookingActiveItem, error) {
	raw, err := u.store.ListAll(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]*CookingActiveItem, 0, len(raw))
	for recipeID, rec := range raw {
		detail, err := u.recipes.GetDetail(ctx, actor.HouseholdID, recipeID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				_ = u.store.Delete(ctx, actor.UserID, recipeID)
				continue
			}
			return nil, err
		}
		out = append(out, u.buildItem(recipeID, rec, detail))
	}
	return sortCookingItems(out), nil
}

func sortCookingItems(items []*CookingActiveItem) []*CookingActiveItem {
	if len(items) <= 1 {
		return items
	}
	// Descending by UpdatedAtMS (most recent first)
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].UpdatedAtMS > items[i].UpdatedAtMS {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
	return items
}

func (u *CookingProgressUsecase) buildItem(recipeID int64, rec data.CookingProgressRecord, detail *data.RecipeDetail) *CookingActiveItem {
	dbSteps := int32(len(detail.Steps))
	stepIdx := int32(rec.StepIndex)
	if stepIdx < 0 {
		stepIdx = 0
	}
	if stepIdx >= dbSteps {
		stepIdx = dbSteps - 1
	}
	if dbSteps < 1 {
		dbSteps = 1
	}
	title := ""
	cover := ""
	if detail.Recipe != nil {
		title = detail.Recipe.Title
		cover = detail.Recipe.CoverImageURL
	}
	nowMs := time.Now().UnixMilli()
	rem := computeRemainingSeconds(rec, nowMs)
	timerRunning := rec.TimerStartedAtMS > 0 && rem > 0
	return &CookingActiveItem{
		RecipeID:            recipeID,
		Title:               title,
		CoverImageURL:       cover,
		StepIndex:           stepIdx,
		TotalSteps:          dbSteps,
		TimerTotalSeconds:   int32(rec.TimerTotalSeconds),
		RemainingSeconds:    rem,
		UpdatedAtMS:         rec.UpdatedAtMS,
		TimerRunning:        timerRunning,
	}
}

func computeRemainingSeconds(rec data.CookingProgressRecord, nowMs int64) int32 {
	if rec.TimerTotalSeconds <= 0 {
		return 0
	}
	if rec.TimerStartedAtMS > 0 {
		elapsed := (nowMs - rec.TimerStartedAtMS) / 1000
		rem := int64(rec.TimerTotalSeconds) - elapsed
		if rem < 0 {
			return 0
		}
		return int32(rem)
	}
	if rec.TimerPausedRemaining > 0 {
		if rec.TimerPausedRemaining > rec.TimerTotalSeconds {
			return int32(rec.TimerTotalSeconds)
		}
		return int32(rec.TimerPausedRemaining)
	}
	return 0
}

// ListSummariesForAI returns snippets for model prompts; never fails on redis (empty list).
func (u *CookingProgressUsecase) ListSummariesForAI(ctx context.Context, actor Actor) []airuntime.ActiveCookingSummary {
	items, err := u.List(ctx, actor)
	if err != nil || len(items) == 0 {
		return nil
	}
	out := make([]airuntime.ActiveCookingSummary, 0, len(items))
	for _, it := range items {
		if it == nil {
			continue
		}
		out = append(out, airuntime.ActiveCookingSummary{
			RecipeID:         it.RecipeID,
			Title:            it.Title,
			StepIndex:        int(it.StepIndex),
			TotalSteps:       int(it.TotalSteps),
			RemainingSeconds: int(it.RemainingSeconds),
			CookPath:         fmt.Sprintf("/cook/%s", strconv.FormatInt(it.RecipeID, 10)),
		})
	}
	return out
}
