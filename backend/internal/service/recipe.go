package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type RecipeService struct {
	v1.UnimplementedRecipeServiceServer

	usecase *biz.RecipeUsecase
}

func NewRecipeService(usecase *biz.RecipeUsecase) *RecipeService {
	return &RecipeService{usecase: usecase}
}

func (s *RecipeService) ListRecipes(ctx context.Context, req *v1.ListRecipesRequest) (*v1.ListRecipesReply, error) {
	actor := biz.ActorFromContext(ctx)
	items, err := s.usecase.ListLatest(ctx, actor.HouseholdID, int(req.GetLimit()), req.GetKeyword(), req.GetKitchenTag())
	if err != nil {
		return nil, err
	}

	recipes := make([]*v1.Recipe, 0, len(items))
	for _, item := range items {
		recipes = append(recipes, toProtoRecipe(item))
	}
	return &v1.ListRecipesReply{Recipes: recipes}, nil
}

func (s *RecipeService) GetRecipeDetail(ctx context.Context, req *v1.GetRecipeDetailRequest) (*v1.GetRecipeDetailReply, error) {
	detail, err := s.usecase.GetDetail(ctx, biz.ActorFromContext(ctx).HouseholdID, req.GetId())
	if err != nil {
		return nil, err
	}
	return &v1.GetRecipeDetailReply{Detail: toProtoRecipeDetail(detail)}, nil
}
