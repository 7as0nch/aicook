package recipe

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/recipe"
	"github.com/chengjiang/aicook/backend/internal/service/convert"
)

type ImportService struct {
	v1.UnimplementedImportServiceServer

	usecase *recipe.ImportUsecase
}

func NewImportService(usecase *recipe.ImportUsecase) *ImportService {
	return &ImportService{usecase: usecase}
}

func (s *ImportService) CreateImageRecipe(ctx context.Context, req *v1.CreateImageRecipeRequest) (*v1.CreateImageRecipeReply, error) {
	actor := common.ActorFromContext(ctx)
	job, err := s.usecase.CreateImageRecipe(ctx, recipe.CreateImageRecipeRequest{
		HouseholdID:   actor.HouseholdID,
		UserID:        actor.UserID,
		MediaAssetIDs: req.GetMediaAssetIds(),
		TitleHint:     req.GetTitleHint(),
		// 拍照/工作台识别：预览模式，不落库，前端确认后再保存
		Preview: true,
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateImageRecipeReply{Job: convert.ToProtoImportJob(job)}, nil
}

func (s *ImportService) GetImportJob(ctx context.Context, req *v1.GetImportJobRequest) (*v1.GetImportJobReply, error) {
	job, err := s.usecase.GetJob(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	return &v1.GetImportJobReply{Job: convert.ToProtoImportJob(job)}, nil
}
