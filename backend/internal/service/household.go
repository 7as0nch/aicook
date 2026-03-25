package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type HouseholdService struct {
	v1.UnimplementedHouseholdServiceServer

	usecase *biz.HouseholdUsecase
}

func NewHouseholdService(usecase *biz.HouseholdUsecase) *HouseholdService {
	return &HouseholdService{usecase: usecase}
}

func (s *HouseholdService) CreateHousehold(ctx context.Context, req *v1.CreateHouseholdRequest) (*v1.CreateHouseholdReply, error) {
	household, err := s.usecase.CreateHousehold(ctx, biz.ActorFromContext(ctx), req.GetName())
	if err != nil {
		return nil, err
	}
	return &v1.CreateHouseholdReply{Household: toProtoHousehold(household)}, nil
}

func (s *HouseholdService) CreateShareCode(ctx context.Context, req *v1.CreateShareCodeRequest) (*v1.CreateShareCodeReply, error) {
	_ = req
	household, err := s.usecase.CreateShareCode(ctx, biz.ActorFromContext(ctx))
	if err != nil {
		return nil, err
	}
	return &v1.CreateShareCodeReply{Household: toProtoHousehold(household)}, nil
}

func (s *HouseholdService) GetKitchenByShareCode(ctx context.Context, req *v1.GetKitchenByShareCodeRequest) (*v1.GetKitchenByShareCodeReply, error) {
	household, recipes, err := s.usecase.GetKitchenByShareCode(ctx, req.GetShareCode())
	if err != nil {
		return nil, err
	}
	items := make([]*v1.SharedRecipePreview, 0, len(recipes))
	for _, recipe := range recipes {
		items = append(items, &v1.SharedRecipePreview{Recipe: toProtoRecipe(recipe)})
	}
	return &v1.GetKitchenByShareCodeReply{
		Household: toProtoHousehold(household),
		Recipes:   items,
	}, nil
}

func (s *HouseholdService) ImportSharedRecipes(ctx context.Context, req *v1.ImportSharedRecipesRequest) (*v1.ImportSharedRecipesReply, error) {
	recipes, tag, err := s.usecase.ImportSharedRecipes(ctx, biz.ActorFromContext(ctx), req.GetShareCode(), req.GetRecipeIds(), req.KitchenTagId, req.GetKitchenTagName())
	if err != nil {
		return nil, err
	}
	items := make([]*v1.Recipe, 0, len(recipes))
	for _, recipe := range recipes {
		items = append(items, toProtoRecipe(recipe))
	}
	return &v1.ImportSharedRecipesReply{
		Recipes:   items,
		KitchenTag: toProtoKitchenTag(tag),
	}, nil
}

func (s *HouseholdService) ListKitchenTags(ctx context.Context, req *v1.ListKitchenTagsRequest) (*v1.ListKitchenTagsReply, error) {
	_ = req
	tags, err := s.usecase.ListKitchenTags(ctx, biz.ActorFromContext(ctx))
	if err != nil {
		return nil, err
	}
	items := make([]*v1.KitchenTag, 0, len(tags))
	for _, tag := range tags {
		items = append(items, toProtoKitchenTag(tag))
	}
	return &v1.ListKitchenTagsReply{Tags: items}, nil
}

func (s *HouseholdService) CreateKitchenTag(ctx context.Context, req *v1.CreateKitchenTagRequest) (*v1.CreateKitchenTagReply, error) {
	tag, err := s.usecase.CreateKitchenTag(ctx, biz.ActorFromContext(ctx), req.GetName(), req.GetIcon(), req.GetColor())
	if err != nil {
		return nil, err
	}
	return &v1.CreateKitchenTagReply{Tag: toProtoKitchenTag(tag)}, nil
}
