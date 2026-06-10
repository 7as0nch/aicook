package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/platform/wechat"
	kerrors "github.com/go-kratos/kratos/v2/errors"
)

type AuthService struct {
	v1.UnimplementedAuthServiceServer

	usecase *user.AuthUsecase
	media   *user.MediaUsecase
	wechat  *wechat.Client // 可能为 nil（appid/secret 未配置）
}

func NewAuthService(usecase *user.AuthUsecase, media *user.MediaUsecase, wechat *wechat.Client) *AuthService {
	return &AuthService{usecase: usecase, media: media, wechat: wechat}
}

func (s *AuthService) Register(ctx context.Context, req *v1.RegisterRequest) (*v1.AuthReply, error) {
	result, err := s.usecase.Register(ctx, user.RegisterRequest{
		Username:      req.GetUsername(),
		Password:      req.GetPassword(),
		DisplayName:   req.GetDisplayName(),
		Phone:         req.GetPhone(),
		Email:         req.GetEmail(),
		HouseholdName: req.GetHouseholdName(),
	})
	if err != nil {
		return nil, err
	}
	return &v1.AuthReply{
		Token:            result.Token,
		User:             toProtoUser(ctx, result.User, s.media),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

func (s *AuthService) Login(ctx context.Context, req *v1.LoginRequest) (*v1.AuthReply, error) {
	result, err := s.usecase.Login(ctx, req.GetUsername(), req.GetPassword())
	if err != nil {
		return nil, err
	}
	return &v1.AuthReply{
		Token:            result.Token,
		User:             toProtoUser(ctx, result.User, s.media),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

// WxLogin 用 wx.login 返回的 code 走 jscode2session 拿 openid，
// 已绑定账号直接签 JWT，否则建 household + user。
// 配置缺失（wechat.appid/secret 都空）时返回 503-ish 错误。
func (s *AuthService) WxLogin(ctx context.Context, req *v1.WxLoginRequest) (*v1.AuthReply, error) {
	if s.wechat == nil {
		return nil, kerrors.New(503, "WECHAT_NOT_CONFIGURED",
			"wechat appid/secret not configured (set config.yaml wechat.appid/secret or env AICOOK_WX_APPID/AICOOK_WX_SECRET)")
	}
	session, err := s.wechat.Code2Session(ctx, req.GetCode())
	if err != nil {
		return nil, kerrors.BadRequest("WECHAT_CODE2SESSION_FAILED", err.Error())
	}
	result, err := s.usecase.LoginByWx(ctx, session.OpenID, session.UnionID, req.GetNickname(), req.GetAvatarUrl())
	if err != nil {
		return nil, err
	}
	return &v1.AuthReply{
		Token:            result.Token,
		User:             toProtoUser(ctx, result.User, s.media),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

func (s *AuthService) GetMe(ctx context.Context, req *v1.GetMeRequest) (*v1.GetMeReply, error) {
	_ = req
	result, err := s.usecase.GetMe(ctx, common.ActorFromContext(ctx))
	if err != nil {
		return nil, err
	}
	return &v1.GetMeReply{
		User:             toProtoUser(ctx, result.User, s.media),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

func (s *AuthService) UpdateProfile(ctx context.Context, req *v1.UpdateProfileRequest) (*v1.GetMeReply, error) {
	var displayName *string
	if req.DisplayName != nil {
		dn := req.GetDisplayName()
		displayName = &dn
	}
	var avatarID *int64
	if req.AvatarAssetId != nil {
		id := req.GetAvatarAssetId()
		avatarID = &id
	}
	result, err := s.usecase.UpdateProfile(ctx, common.ActorFromContext(ctx), displayName, avatarID)
	if err != nil {
		return nil, err
	}
	return &v1.GetMeReply{
		User:             toProtoUser(ctx, result.User, s.media),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

func (s *AuthService) ListMyHouseholds(ctx context.Context, req *v1.ListMyHouseholdsRequest) (*v1.ListMyHouseholdsReply, error) {
	_ = req
	items, err := s.usecase.ListMyHouseholds(ctx, common.ActorFromContext(ctx).UserID)
	if err != nil {
		return nil, err
	}
	return &v1.ListMyHouseholdsReply{Households: toProtoHouseholds(items)}, nil
}

func (s *AuthService) SwitchHousehold(ctx context.Context, req *v1.SwitchHouseholdRequest) (*v1.AuthReply, error) {
	result, err := s.usecase.SwitchHousehold(ctx, common.ActorFromContext(ctx), req.GetHouseholdId())
	if err != nil {
		return nil, err
	}
	return &v1.AuthReply{
		Token:            result.Token,
		User:             toProtoUser(ctx, result.User, s.media),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}
