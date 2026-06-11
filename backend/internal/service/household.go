package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
)

type HouseholdService struct {
	v1.UnimplementedHouseholdServiceServer

	usecase *user.HouseholdUsecase
	media   *user.MediaUsecase
}

func NewHouseholdService(usecase *user.HouseholdUsecase, media *user.MediaUsecase) *HouseholdService {
	return &HouseholdService{usecase: usecase, media: media}
}

func (s *HouseholdService) CreateHousehold(ctx context.Context, req *v1.CreateHouseholdRequest) (*v1.CreateHouseholdReply, error) {
	household, err := s.usecase.CreateHousehold(ctx, common.ActorFromContext(ctx), req.GetName())
	if err != nil {
		return nil, err
	}
	return &v1.CreateHouseholdReply{Household: toProtoHousehold(household)}, nil
}

func (s *HouseholdService) CreateShareCode(ctx context.Context, req *v1.CreateShareCodeRequest) (*v1.CreateShareCodeReply, error) {
	_ = req
	household, err := s.usecase.CreateShareCode(ctx, common.ActorFromContext(ctx))
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
		r := toProtoRecipe(recipe)
		signRecipeMediaURLs(ctx, s.media, r)
		items = append(items, &v1.SharedRecipePreview{Recipe: r})
	}
	return &v1.GetKitchenByShareCodeReply{
		Household: toProtoHousehold(household),
		Recipes:   items,
	}, nil
}

func (s *HouseholdService) ImportSharedRecipes(ctx context.Context, req *v1.ImportSharedRecipesRequest) (*v1.ImportSharedRecipesReply, error) {
	recipes, tag, err := s.usecase.ImportSharedRecipes(ctx, common.ActorFromContext(ctx), req.GetShareCode(), req.GetRecipeIds(), req.KitchenTagId, req.GetKitchenTagName())
	if err != nil {
		return nil, err
	}
	items := make([]*v1.Recipe, 0, len(recipes))
	for _, recipe := range recipes {
		r := toProtoRecipe(recipe)
		signRecipeMediaURLs(ctx, s.media, r)
		items = append(items, r)
	}
	return &v1.ImportSharedRecipesReply{
		Recipes:    items,
		KitchenTag: toProtoKitchenTag(tag),
	}, nil
}

func (s *HouseholdService) ListKitchenTags(ctx context.Context, req *v1.ListKitchenTagsRequest) (*v1.ListKitchenTagsReply, error) {
	_ = req
	tags, err := s.usecase.ListKitchenTags(ctx, common.ActorFromContext(ctx))
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
	tag, err := s.usecase.CreateKitchenTag(ctx, common.ActorFromContext(ctx), req.GetName(), req.GetIcon(), req.GetColor())
	if err != nil {
		return nil, err
	}
	return &v1.CreateKitchenTagReply{Tag: toProtoKitchenTag(tag)}, nil
}

func (s *HouseholdService) UpdateKitchenTag(ctx context.Context, req *v1.UpdateKitchenTagRequest) (*v1.UpdateKitchenTagReply, error) {
	tag, err := s.usecase.UpdateKitchenTag(ctx, common.ActorFromContext(ctx), req.GetId(), req.GetName(), req.GetIcon(), req.GetColor())
	if err != nil {
		return nil, err
	}
	return &v1.UpdateKitchenTagReply{Tag: toProtoKitchenTag(tag)}, nil
}

func (s *HouseholdService) DeleteKitchenTag(ctx context.Context, req *v1.DeleteKitchenTagRequest) (*v1.DeleteKitchenTagReply, error) {
	if err := s.usecase.DeleteKitchenTag(ctx, common.ActorFromContext(ctx), req.GetId()); err != nil {
		return nil, err
	}
	return &v1.DeleteKitchenTagReply{}, nil
}

func (s *HouseholdService) GetHouseholdPreferences(ctx context.Context, _ *v1.GetHouseholdPreferencesRequest) (*v1.GetHouseholdPreferencesReply, error) {
	prefs, err := s.usecase.GetPreferences(ctx, common.ActorFromContext(ctx))
	if err != nil {
		return nil, err
	}
	return &v1.GetHouseholdPreferencesReply{Preferences: toProtoPreferences(prefs)}, nil
}

func (s *HouseholdService) UpdateHouseholdPreferences(ctx context.Context, req *v1.UpdateHouseholdPreferencesRequest) (*v1.UpdateHouseholdPreferencesReply, error) {
	in := req.GetPreferences()
	prefs, err := s.usecase.UpdatePreferences(ctx, common.ActorFromContext(ctx), &user.HouseholdPreferences{
		Flavor:        in.GetFlavor(),
		Scenarios:     in.GetScenarios(),
		Restrictions:  in.GetRestrictions(),
		MaxDifficulty: int(in.GetMaxDifficulty()),
		MaxMinutes:    int(in.GetMaxMinutes()),
	})
	if err != nil {
		return nil, err
	}
	return &v1.UpdateHouseholdPreferencesReply{Preferences: toProtoPreferences(prefs)}, nil
}

func (s *HouseholdService) ListHouseholdMembers(ctx context.Context, req *v1.ListHouseholdMembersRequest) (*v1.ListHouseholdMembersReply, error) {
	actor := common.ActorFromContext(ctx)
	hhID := req.GetHouseholdId()
	if hhID == 0 {
		hhID = actor.HouseholdID
	}
	members, err := s.usecase.ListMembers(ctx, actor, hhID)
	if err != nil {
		return nil, err
	}
	out := make([]*v1.HouseholdMemberDetail, 0, len(members))
	for _, m := range members {
		out = append(out, &v1.HouseholdMemberDetail{
			Id:          m.ID,
			UserId:      m.UserID,
			Role:        m.Role,
			DisplayName: m.DisplayName,
			AvatarUrl:   m.AvatarURL,
			Emoji:       m.Emoji,
			FlavorTags:  append([]string(nil), m.FlavorTags...),
		})
	}
	return &v1.ListHouseholdMembersReply{Members: out}, nil
}

func toProtoPreferences(p *user.HouseholdPreferences) *v1.HouseholdPreferences {
	if p == nil {
		return &v1.HouseholdPreferences{}
	}
	return &v1.HouseholdPreferences{
		Flavor:        append([]string(nil), p.Flavor...),
		Scenarios:     append([]string(nil), p.Scenarios...),
		Restrictions:  append([]string(nil), p.Restrictions...),
		MaxDifficulty: int32(p.MaxDifficulty),
		MaxMinutes:    int32(p.MaxMinutes),
		TasteNote:     p.TasteNote,
	}
}

// fromProtoPreferences proto → biz 结构。
func fromProtoPreferences(in *v1.HouseholdPreferences) *user.HouseholdPreferences {
	if in == nil {
		return &user.HouseholdPreferences{}
	}
	return &user.HouseholdPreferences{
		Flavor:        in.GetFlavor(),
		Scenarios:     in.GetScenarios(),
		Restrictions:  in.GetRestrictions(),
		MaxDifficulty: int(in.GetMaxDifficulty()),
		MaxMinutes:    int(in.GetMaxMinutes()),
		TasteNote:     in.GetTasteNote(),
	}
}

// AddHouseholdMember 新增虚拟成员（owner only）。
func (s *HouseholdService) AddHouseholdMember(ctx context.Context, req *v1.AddHouseholdMemberRequest) (*v1.AddHouseholdMemberReply, error) {
	actor := common.ActorFromContext(ctx)
	member, err := s.usecase.AddMember(ctx, actor, req.GetHouseholdId(), req.GetDisplayName(), req.GetEmoji(), fromProtoPreferences(req.GetPreferences()))
	if err != nil {
		return nil, err
	}
	return &v1.AddHouseholdMemberReply{
		Member: &v1.HouseholdMemberDetail{
			Id:          member.ID,
			UserId:      member.UserID,
			Role:        member.Role,
			DisplayName: member.DisplayName,
			AvatarUrl:   member.AvatarURL,
			Emoji:       member.Emoji,
			FlavorTags:  append([]string(nil), member.FlavorTags...),
		},
	}, nil
}

// RemoveHouseholdMember 软删成员（owner only）。
func (s *HouseholdService) RemoveHouseholdMember(ctx context.Context, req *v1.RemoveHouseholdMemberRequest) (*v1.RemoveHouseholdMemberReply, error) {
	if err := s.usecase.RemoveMember(ctx, common.ActorFromContext(ctx), req.GetMemberId()); err != nil {
		return nil, err
	}
	return &v1.RemoveHouseholdMemberReply{}, nil
}

// GetMemberPreferences 读单个成员个人口味。
func (s *HouseholdService) GetMemberPreferences(ctx context.Context, req *v1.GetMemberPreferencesRequest) (*v1.GetMemberPreferencesReply, error) {
	prefs, err := s.usecase.GetMemberPreferences(ctx, common.ActorFromContext(ctx), req.GetMemberId())
	if err != nil {
		return nil, err
	}
	return &v1.GetMemberPreferencesReply{Preferences: toProtoPreferences(prefs)}, nil
}

// UpdateMemberPreferences 改单个成员口味（owner 或本人）。
func (s *HouseholdService) UpdateMemberPreferences(ctx context.Context, req *v1.UpdateMemberPreferencesRequest) (*v1.UpdateMemberPreferencesReply, error) {
	prefs, err := s.usecase.UpdateMemberPreferences(ctx, common.ActorFromContext(ctx), req.GetMemberId(), fromProtoPreferences(req.GetPreferences()))
	if err != nil {
		return nil, err
	}
	return &v1.UpdateMemberPreferencesReply{Preferences: toProtoPreferences(prefs)}, nil
}
