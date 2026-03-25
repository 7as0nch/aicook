package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type AuthService struct {
	v1.UnimplementedAuthServiceServer

	usecase *biz.AuthUsecase
}

func NewAuthService(usecase *biz.AuthUsecase) *AuthService {
	return &AuthService{usecase: usecase}
}

func (s *AuthService) Register(ctx context.Context, req *v1.RegisterRequest) (*v1.AuthReply, error) {
	result, err := s.usecase.Register(ctx, biz.RegisterRequest{
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
		User:             toProtoUser(result.User),
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
		User:             toProtoUser(result.User),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

func (s *AuthService) GetMe(ctx context.Context, req *v1.GetMeRequest) (*v1.GetMeReply, error) {
	_ = req
	result, err := s.usecase.GetMe(ctx, biz.ActorFromContext(ctx))
	if err != nil {
		return nil, err
	}
	return &v1.GetMeReply{
		User:             toProtoUser(result.User),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}

func (s *AuthService) ListMyHouseholds(ctx context.Context, req *v1.ListMyHouseholdsRequest) (*v1.ListMyHouseholdsReply, error) {
	_ = req
	items, err := s.usecase.ListMyHouseholds(ctx, biz.ActorFromContext(ctx).UserID)
	if err != nil {
		return nil, err
	}
	return &v1.ListMyHouseholdsReply{Households: toProtoHouseholds(items)}, nil
}

func (s *AuthService) SwitchHousehold(ctx context.Context, req *v1.SwitchHouseholdRequest) (*v1.AuthReply, error) {
	result, err := s.usecase.SwitchHousehold(ctx, biz.ActorFromContext(ctx), req.GetHouseholdId())
	if err != nil {
		return nil, err
	}
	return &v1.AuthReply{
		Token:            result.Token,
		User:             toProtoUser(result.User),
		CurrentHousehold: toProtoHousehold(result.CurrentHousehold),
		Households:       toProtoHouseholds(result.Households),
	}, nil
}
