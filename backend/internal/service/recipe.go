package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/recipe"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
)

type RecipeService struct {
	v1.UnimplementedRecipeServiceServer

	usecase   *recipe.RecipeUsecase
	media     *user.MediaUsecase
	recommend *recipe.RecommendUsecase
	favorite  *recipe.RecipeFavoriteUsecase
}

func NewRecipeService(usecase *recipe.RecipeUsecase, media *user.MediaUsecase, recommend *recipe.RecommendUsecase, favorite *recipe.RecipeFavoriteUsecase) *RecipeService {
	return &RecipeService{usecase: usecase, media: media, recommend: recommend, favorite: favorite}
}

// injectFavoredBatch 批量注入 favored 字段到一组 proto Recipe。
func (s *RecipeService) injectFavoredBatch(ctx context.Context, recipes []*v1.Recipe) {
	if len(recipes) == 0 || s.favorite == nil {
		return
	}
	actor := common.ActorFromContext(ctx)
	if actor.HouseholdID == 0 || actor.UserID == 0 {
		return
	}
	ids := make([]int64, 0, len(recipes))
	for _, r := range recipes {
		if r != nil {
			ids = append(ids, r.GetId())
		}
	}
	mp, err := s.favorite.IsFavoredBatch(ctx, actor.HouseholdID, actor.UserID, ids)
	if err != nil || len(mp) == 0 {
		return
	}
	for _, r := range recipes {
		if r != nil && mp[r.GetId()] {
			r.Favored = true
		}
	}
}

func (s *RecipeService) ListRecipes(ctx context.Context, req *v1.ListRecipesRequest) (*v1.ListRecipesReply, error) {
	actor := common.ActorFromContext(ctx)
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
	s.injectFavoredBatch(ctx, recipes)
	return &v1.ListRecipesReply{Recipes: recipes}, nil
}

func (s *RecipeService) GetRecipeDetail(ctx context.Context, req *v1.GetRecipeDetailRequest) (*v1.GetRecipeDetailReply, error) {
	actor := common.ActorFromContext(ctx)
	detail, err := s.usecase.GetDetail(ctx, actor.HouseholdID, req.GetId())
	if err != nil {
		return nil, err
	}
	out := toProtoRecipeDetail(detail)
	signRecipeDetailMediaURLs(ctx, s.media, out)
	// 注入收藏标记
	if out != nil && out.GetRecipe() != nil && s.favorite != nil && actor.UserID > 0 {
		if favored, _ := s.favorite.IsFavored(ctx, actor.HouseholdID, actor.UserID, req.GetId()); favored {
			out.Recipe.Favored = true
		}
	}
	return &v1.GetRecipeDetailReply{Detail: out}, nil
}

func (s *RecipeService) CreateRecipeDraft(ctx context.Context, req *v1.CreateRecipeDraftRequest) (*v1.CreateRecipeDraftReply, error) {
	actor := common.ActorFromContext(ctx)
	detail, err := s.usecase.CreateDraft(ctx, recipe.CreateRecipeDraftRequest{
		HouseholdID:      actor.HouseholdID,
		UserID:           actor.UserID,
		Title:            req.GetTitle(),
		Summary:          req.GetSummary(),
		CoverImageURL:    req.GetCoverImageUrl(),
		Category:         req.GetCategory(),
		TotalMinutes:     int(req.GetTotalMinutes()),
		Difficulty:       int(req.GetDifficulty()),
		Tools:            req.GetTools(),
		ScenarioTags:     req.GetScenarioTags(),
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
	actor := common.ActorFromContext(ctx)
	meta := map[string]any{}
	if m := req.GetMetadata(); m != nil {
		meta = m.AsMap()
	}
	detail, err := s.usecase.UpdateRecipe(ctx, recipe.UpdateRecipeRequest{
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
	actor := common.ActorFromContext(ctx)
	if err := s.usecase.DeleteRecipe(ctx, actor.HouseholdID, req.GetId()); err != nil {
		return nil, err
	}
	return &v1.DeleteRecipeReply{Ok: true}, nil
}

func (s *RecipeService) ListTodayRecipes(ctx context.Context, req *v1.ListTodayRecipesRequest) (*v1.ListTodayRecipesReply, error) {
	actor := common.ActorFromContext(ctx)
	items, err := s.recommend.ListToday(ctx, actor, int(req.GetLimit()))
	if err != nil {
		return nil, err
	}
	out := make([]*v1.TodayRecipe, 0, len(items))
	protoRecipes := make([]*v1.Recipe, 0, len(items))
	for _, it := range items {
		if it == nil || it.Recipe == nil {
			continue
		}
		r := toProtoRecipe(it.Recipe)
		signRecipeMediaURLs(ctx, s.media, r)
		reasons := make([]*v1.TodayRecipeReason, 0, len(it.Reasons))
		for _, reason := range it.Reasons {
			reasons = append(reasons, &v1.TodayRecipeReason{Kind: reason.Kind, Label: reason.Label})
		}
		out = append(out, &v1.TodayRecipe{
			Recipe:  r,
			Score:   it.Score,
			Reasons: reasons,
		})
		protoRecipes = append(protoRecipes, r)
	}
	s.injectFavoredBatch(ctx, protoRecipes)
	return &v1.ListTodayRecipesReply{Items: out}, nil
}

// --- Favorites ---

func (s *RecipeService) AddRecipeFavorite(ctx context.Context, req *v1.AddRecipeFavoriteRequest) (*v1.AddRecipeFavoriteReply, error) {
	actor := common.ActorFromContext(ctx)
	recipe, err := s.favorite.Add(ctx, actor.HouseholdID, actor.UserID, req.GetRecipeId())
	if err != nil {
		return nil, err
	}
	r := toProtoRecipe(recipe)
	signRecipeMediaURLs(ctx, s.media, r)
	if r != nil {
		r.Favored = true
	}
	return &v1.AddRecipeFavoriteReply{Recipe: r, Favored: true}, nil
}

func (s *RecipeService) RemoveRecipeFavorite(ctx context.Context, req *v1.RemoveRecipeFavoriteRequest) (*v1.RemoveRecipeFavoriteReply, error) {
	actor := common.ActorFromContext(ctx)
	if err := s.favorite.Remove(ctx, actor.HouseholdID, actor.UserID, req.GetRecipeId()); err != nil {
		return nil, err
	}
	return &v1.RemoveRecipeFavoriteReply{Ok: true}, nil
}

func (s *RecipeService) ListMyFavorites(ctx context.Context, req *v1.ListMyFavoritesRequest) (*v1.ListMyFavoritesReply, error) {
	actor := common.ActorFromContext(ctx)
	recipes, total, err := s.favorite.ListMyFavorites(ctx, actor.HouseholdID, actor.UserID, int(req.GetLimit()), req.GetBeforeId())
	if err != nil {
		return nil, err
	}
	out := make([]*v1.Recipe, 0, len(recipes))
	for _, item := range recipes {
		r := toProtoRecipe(item)
		signRecipeMediaURLs(ctx, s.media, r)
		if r != nil {
			r.Favored = true
		}
		out = append(out, r)
	}
	return &v1.ListMyFavoritesReply{Recipes: out, Total: total}, nil
}
