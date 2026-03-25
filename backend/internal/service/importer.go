package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type ImportService struct {
	v1.UnimplementedImportServiceServer

	usecase *biz.ImportUsecase
}

func NewImportService(usecase *biz.ImportUsecase) *ImportService {
	return &ImportService{usecase: usecase}
}

func (s *ImportService) CreateImageRecipe(ctx context.Context, req *v1.CreateImageRecipeRequest) (*v1.CreateImageRecipeReply, error) {
	actor := biz.ActorFromContext(ctx)
	job, err := s.usecase.CreateImageRecipe(ctx, biz.CreateImageRecipeRequest{
		HouseholdID:   actor.HouseholdID,
		UserID:        actor.UserID,
		MediaAssetIDs: req.GetMediaAssetIds(),
		TitleHint:     req.GetTitleHint(),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateImageRecipeReply{Job: toProtoImportJob(job)}, nil
}

func (s *ImportService) GetImportJob(ctx context.Context, req *v1.GetImportJobRequest) (*v1.GetImportJobReply, error) {
	job, err := s.usecase.GetJob(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	return &v1.GetImportJobReply{Job: toProtoImportJob(job)}, nil
}
