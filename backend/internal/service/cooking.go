package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type CookingService struct {
	v1.UnimplementedCookingServiceServer

	usecase *biz.CookingProgressUsecase
	media   *biz.MediaUsecase
}

func NewCookingService(usecase *biz.CookingProgressUsecase, media *biz.MediaUsecase) *CookingService {
	return &CookingService{usecase: usecase, media: media}
}

func (s *CookingService) ListActiveCooking(ctx context.Context, _ *v1.ListActiveCookingRequest) (*v1.ListActiveCookingReply, error) {
	items, err := s.usecase.List(ctx, biz.ActorFromContext(ctx))
	if err != nil {
		return nil, err
	}
	out := make([]*v1.ActiveCooking, 0, len(items))
	for _, it := range items {
		if it == nil {
			continue
		}
		ac := &v1.ActiveCooking{
			RecipeId:            it.RecipeID,
			Title:               it.Title,
			CoverImageUrl:       it.CoverImageURL,
			StepIndex:           it.StepIndex,
			TotalSteps:          it.TotalSteps,
			TimerTotalSeconds:   it.TimerTotalSeconds,
			RemainingSeconds:    it.RemainingSeconds,
			UpdatedAtMs:         it.UpdatedAtMS,
			TimerRunning:        it.TimerRunning,
		}
		if ac.GetCoverImageUrl() != "" && s.media != nil {
			if signed, err := s.media.SignMediaURL(ctx, ac.GetCoverImageUrl()); err == nil && signed != "" {
				ac.CoverImageUrl = signed
			}
		}
		out = append(out, ac)
	}
	return &v1.ListActiveCookingReply{Items: out}, nil
}

func (s *CookingService) UpsertActiveCooking(ctx context.Context, req *v1.UpsertActiveCookingRequest) (*v1.UpsertActiveCookingReply, error) {
	it, err := s.usecase.Upsert(ctx, biz.ActorFromContext(ctx), req.GetRecipeId(), req.GetStepIndex(), req.GetTotalSteps(), req.GetTimerTotalSeconds(), req.GetTimerStartedAtMs(), req.GetTimerPausedRemaining())
	if err != nil {
		return nil, err
	}
	ac := &v1.ActiveCooking{
		RecipeId:            it.RecipeID,
		Title:               it.Title,
		CoverImageUrl:       it.CoverImageURL,
		StepIndex:           it.StepIndex,
		TotalSteps:          it.TotalSteps,
		TimerTotalSeconds:   it.TimerTotalSeconds,
		RemainingSeconds:    it.RemainingSeconds,
		UpdatedAtMs:         it.UpdatedAtMS,
		TimerRunning:        it.TimerRunning,
	}
	if ac.GetCoverImageUrl() != "" && s.media != nil {
		if signed, err := s.media.SignMediaURL(ctx, ac.GetCoverImageUrl()); err == nil && signed != "" {
			ac.CoverImageUrl = signed
		}
	}
	return &v1.UpsertActiveCookingReply{Item: ac}, nil
}

func (s *CookingService) DeleteActiveCooking(ctx context.Context, req *v1.DeleteActiveCookingRequest) (*v1.DeleteActiveCookingReply, error) {
	if err := s.usecase.Delete(ctx, biz.ActorFromContext(ctx), req.GetRecipeId()); err != nil {
		return nil, err
	}
	return &v1.DeleteActiveCookingReply{}, nil
}
