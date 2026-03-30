package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type RecipeService struct {
	v1.UnimplementedRecipeServiceServer

	usecase *biz.RecipeUsecase
	media   *biz.MediaUsecase
}

func NewRecipeService(usecase *biz.RecipeUsecase, media *biz.MediaUsecase) *RecipeService {
	return &RecipeService{usecase: usecase, media: media}
}

func (s *RecipeService) ListRecipes(ctx context.Context, req *v1.ListRecipesRequest) (*v1.ListRecipesReply, error) {
	actor := biz.ActorFromContext(ctx)
	items, err := s.usecase.ListLatest(ctx, actor.HouseholdID, int(req.GetLimit()), req.GetKeyword(), req.GetKitchenTag(), req.GetExcludeDraft(), req.GetRecipeStatus())
	if err != nil {
		return nil, err
	}

	recipes := make([]*v1.Recipe, 0, len(items))
	for _, item := range items {
		r := toProtoRecipe(item)
		signRecipeMediaURLs(ctx, s.media, r)
		recipes = append(recipes, r)
	}
	return &v1.ListRecipesReply{Recipes: recipes}, nil
}

func (s *RecipeService) GetRecipeDetail(ctx context.Context, req *v1.GetRecipeDetailRequest) (*v1.GetRecipeDetailReply, error) {
	detail, err := s.usecase.GetDetail(ctx, biz.ActorFromContext(ctx).HouseholdID, req.GetId())
	if err != nil {
		return nil, err
	}
	out := toProtoRecipeDetail(detail)
	signRecipeDetailMediaURLs(ctx, s.media, out)
	return &v1.GetRecipeDetailReply{Detail: out}, nil
}

func (s *RecipeService) CreateRecipeDraft(ctx context.Context, req *v1.CreateRecipeDraftRequest) (*v1.CreateRecipeDraftReply, error) {
	actor := biz.ActorFromContext(ctx)
	detail, err := s.usecase.CreateDraft(ctx, biz.CreateRecipeDraftRequest{
		HouseholdID:   actor.HouseholdID,
		UserID:        actor.UserID,
		Title:         req.GetTitle(),
		Summary:       req.GetSummary(),
		CoverImageURL: req.GetCoverImageUrl(),
		Category:      req.GetCategory(),
		TotalMinutes:  int(req.GetTotalMinutes()),
		Difficulty:    int(req.GetDifficulty()),
		Tools:         req.GetTools(),
		ScenarioTags:  req.GetScenarioTags(),
		FlavorTags:       req.GetFlavorTags(),
		GalleryImageURLs: req.GetGalleryImageUrls(),
		Ingredients:      toDraftIngredients(req.GetIngredients()),
		Steps:            toDraftSteps(req.GetSteps()),
	})
	if err != nil {
		return nil, err
	}
	out := toProtoRecipeDetail(detail)
	signRecipeDetailMediaURLs(ctx, s.media, out)
	return &v1.CreateRecipeDraftReply{Detail: out}, nil
}

func (s *RecipeService) UpdateRecipe(ctx context.Context, req *v1.UpdateRecipeRequest) (*v1.UpdateRecipeReply, error) {
	actor := biz.ActorFromContext(ctx)
	meta := map[string]any{}
	if m := req.GetMetadata(); m != nil {
		meta = m.AsMap()
	}
	detail, err := s.usecase.UpdateRecipe(ctx, biz.UpdateRecipeRequest{
		HouseholdID:      actor.HouseholdID,
		RecipeID:         req.GetId(),
		Title:            req.GetTitle(),
		Summary:          req.GetSummary(),
		CoverImageURL:    req.GetCoverImageUrl(),
		GalleryImageURLs: req.GetGalleryImageUrls(),
		Category:         req.GetCategory(),
		Status:           req.GetStatus(),
		TotalMinutes:     int(req.GetTotalMinutes()),
		Difficulty:       int(req.GetDifficulty()),
		Tools:            req.GetTools(),
		ScenarioTags:     req.GetScenarioTags(),
		FlavorTags:       req.GetFlavorTags(),
		MetadataJSON:     meta,
		Ingredients:      toDraftIngredients(req.GetIngredients()),
		Steps:            toDraftSteps(req.GetSteps()),
	})
	if err != nil {
		return nil, err
	}
	out := toProtoRecipeDetail(detail)
	signRecipeDetailMediaURLs(ctx, s.media, out)
	return &v1.UpdateRecipeReply{Detail: out}, nil
}

func (s *RecipeService) DeleteRecipe(ctx context.Context, req *v1.DeleteRecipeRequest) (*v1.DeleteRecipeReply, error) {
	actor := biz.ActorFromContext(ctx)
	if err := s.usecase.DeleteRecipe(ctx, actor.HouseholdID, req.GetId()); err != nil {
		return nil, err
	}
	return &v1.DeleteRecipeReply{Ok: true}, nil
}
