package biz

import (
	"context"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	gca "github.com/7as0nch/gocommon/auth"
	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/utils"
)

type AuthUsecase struct {
	repo      *data.AuthRepo
	mediaRepo *data.MediaRepo
	tokenRepo gca.AuthRepo
}

type RegisterRequest struct {
	Username      string
	Password      string
	DisplayName   string
	Phone         string
	Email         string
	HouseholdName string
}

type AuthResult struct {
	Token            string
	User             *data.User
	CurrentHousehold *data.Household
	Households       []*data.Household
}

func NewAuthUsecase(repo *data.AuthRepo, mediaRepo *data.MediaRepo, tokenRepo gca.AuthRepo) *AuthUsecase {
	return &AuthUsecase{repo: repo, mediaRepo: mediaRepo, tokenRepo: tokenRepo}
}

func (u *AuthUsecase) Register(ctx context.Context, req RegisterRequest) (*AuthResult, error) {
	username := strings.TrimSpace(req.Username)
	if username == "" || strings.TrimSpace(req.Password) == "" {
		return nil, fmt.Errorf("username and password are required")
	}
	if _, err := u.repo.FindUserByUsername(ctx, username); err == nil {
		return nil, fmt.Errorf("username already exists")
	} else if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = username
	}
	householdName := strings.TrimSpace(req.HouseholdName)
	if householdName == "" {
		householdName = displayName + "的厨房"
	}
	household := &data.Household{
		BaseModel:  data.BaseModel{ID: utils.GetSFID()},
		Name:       householdName,
		ShareCode:  utils.GetSFIDBase62(),
		Timezone:   "Asia/Shanghai",
		Preferences: nil,
	}
	user := &data.User{
		BaseModel:    data.BaseModel{ID: utils.GetSFID()},
		Username:     username,
		PasswordHash: string(passwordHash),
		Phone:        strings.TrimSpace(req.Phone),
		DisplayName:  displayName,
		Email:        strings.TrimSpace(req.Email),
		Status:       "active",
	}
	if err := u.repo.CreateUserWithHousehold(ctx, household, user, "owner"); err != nil {
		return nil, err
	}
	households, err := u.repo.ListHouseholdsByUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	token, err := u.tokenRepo.NewTokenWithClaims(ctx, &auth.JwtClaims{
		UserId:      user.ID,
		HouseholdId: household.ID,
		UserName:    user.Username,
		UserPhone:   user.Phone,
	})
	if err != nil {
		return nil, err
	}
	return &AuthResult{
		Token:            token,
		User:             user,
		CurrentHousehold: household,
		Households:       households,
	}, nil
}

// LoginByWx 通过微信 openid 登录/注册：
//   - openid 已绑定用户 → 直接签 JWT
//   - 否则新建 household + user（username = "wx_<openid>"，密码留空可登），并绑定 openid
func (u *AuthUsecase) LoginByWx(ctx context.Context, openid, unionid, nickname, avatarURL string) (*AuthResult, error) {
	openid = strings.TrimSpace(openid)
	if openid == "" {
		return nil, fmt.Errorf("openid is required")
	}
	existing, err := u.repo.FindUserByWxOpenid(ctx, openid)
	if err == nil && existing != nil {
		// 老用户：直接签 token
		current, err := u.repo.GetHousehold(ctx, existing.HouseholdID)
		if err != nil {
			return nil, err
		}
		households, err := u.repo.ListHouseholdsByUser(ctx, existing.ID)
		if err != nil {
			return nil, err
		}
		token, err := u.tokenRepo.NewTokenWithClaims(ctx, &auth.JwtClaims{
			UserId:      existing.ID,
			HouseholdId: current.ID,
			UserName:    existing.Username,
			UserPhone:   existing.Phone,
		})
		if err != nil {
			return nil, err
		}
		return &AuthResult{
			Token:            token,
			User:             existing,
			CurrentHousehold: current,
			Households:       households,
		}, nil
	} else if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// 新用户：创建 household + user
	displayName := strings.TrimSpace(nickname)
	if displayName == "" {
		displayName = "微信用户"
	}
	username := "wx_" + openid
	if len(username) > 60 {
		username = username[:60]
	}
	// 微信登录用户的密码留随机值（不允许密码登录）
	randPwd, _ := bcrypt.GenerateFromPassword([]byte(utils.GetSFIDBase62()+utils.GetSFIDBase62()), bcrypt.DefaultCost)

	household := &data.Household{
		BaseModel:   data.BaseModel{ID: utils.GetSFID()},
		Name:        displayName + "的厨房",
		ShareCode:   utils.GetSFIDBase62(),
		Timezone:    "Asia/Shanghai",
		Preferences: nil,
	}
	user := &data.User{
		BaseModel:    data.BaseModel{ID: utils.GetSFID()},
		Username:     username,
		PasswordHash: string(randPwd),
		DisplayName:  displayName,
		Status:       "active",
		WxOpenid:     openid,
		WxUnionid:    strings.TrimSpace(unionid),
	}
	if err := u.repo.CreateUserWithHousehold(ctx, household, user, "owner"); err != nil {
		return nil, err
	}
	households, err := u.repo.ListHouseholdsByUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	token, err := u.tokenRepo.NewTokenWithClaims(ctx, &auth.JwtClaims{
		UserId:      user.ID,
		HouseholdId: household.ID,
		UserName:    user.Username,
		UserPhone:   user.Phone,
	})
	if err != nil {
		return nil, err
	}
	return &AuthResult{
		Token:            token,
		User:             user,
		CurrentHousehold: household,
		Households:       households,
	}, nil
}

func (u *AuthUsecase) Login(ctx context.Context, username, password string) (*AuthResult, error) {
	user, err := u.repo.FindUserByUsername(ctx, strings.TrimSpace(username))
	if err != nil {
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid username or password")
	}
	households, err := u.repo.ListHouseholdsByUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	current, err := u.repo.GetHousehold(ctx, user.HouseholdID)
	if err != nil {
		return nil, err
	}
	token, err := u.tokenRepo.NewTokenWithClaims(ctx, &auth.JwtClaims{
		UserId:      user.ID,
		HouseholdId: current.ID,
		UserName:    user.Username,
		UserPhone:   user.Phone,
	})
	if err != nil {
		return nil, err
	}
	return &AuthResult{
		Token:            token,
		User:             user,
		CurrentHousehold: current,
		Households:       households,
	}, nil
}

func (u *AuthUsecase) GetMe(ctx context.Context, actor Actor) (*AuthResult, error) {
	user, err := u.repo.GetUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	current, err := u.repo.GetHousehold(ctx, actor.HouseholdID)
	if err != nil {
		return nil, err
	}
	households, err := u.repo.ListHouseholdsByUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	return &AuthResult{
		User:             user,
		CurrentHousehold: current,
		Households:       households,
	}, nil
}

// UpdateProfile 更新昵称与/或头像 asset（avatar_asset_id 为 0 且字段已设置时表示清空）。
func (u *AuthUsecase) UpdateProfile(ctx context.Context, actor Actor, displayName *string, avatarAssetID *int64) (*AuthResult, error) {
	if displayName == nil && avatarAssetID == nil {
		return u.GetMe(ctx, actor)
	}
	user, err := u.repo.GetUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if displayName != nil {
		dn := strings.TrimSpace(*displayName)
		if dn == "" {
			return nil, fmt.Errorf("display_name cannot be empty")
		}
		if len(dn) > 60 {
			return nil, fmt.Errorf("display_name too long")
		}
		updates["display_name"] = dn
	}
	if avatarAssetID != nil {
		if *avatarAssetID == 0 {
			updates["avatar_asset_id"] = nil
		} else {
			asset, err := u.mediaRepo.Get(ctx, *avatarAssetID)
			if err != nil {
				return nil, fmt.Errorf("avatar asset not found")
			}
			if asset.UserID != actor.UserID {
				return nil, fmt.Errorf("avatar asset does not belong to user")
			}
			if asset.HouseholdID != actor.HouseholdID {
				return nil, fmt.Errorf("avatar asset household mismatch")
			}
			if asset.MediaType != "image" {
				return nil, fmt.Errorf("avatar must be an image")
			}
			updates["avatar_asset_id"] = *avatarAssetID
		}
	}
	if err := u.repo.UpdateUser(ctx, user.ID, updates); err != nil {
		return nil, err
	}
	return u.GetMe(ctx, actor)
}

func (u *AuthUsecase) ListMyHouseholds(ctx context.Context, userID int64) ([]*data.Household, error) {
	return u.repo.ListHouseholdsByUser(ctx, userID)
}

func (u *AuthUsecase) SwitchHousehold(ctx context.Context, actor Actor, householdID int64) (*AuthResult, error) {
	ok, err := u.repo.HasMembership(ctx, actor.UserID, householdID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("user does not belong to target household")
	}
	user, err := u.repo.GetUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	current, err := u.repo.GetHousehold(ctx, householdID)
	if err != nil {
		return nil, err
	}
	households, err := u.repo.ListHouseholdsByUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	token, err := u.tokenRepo.NewTokenWithClaims(ctx, &auth.JwtClaims{
		UserId:      user.ID,
		HouseholdId: householdID,
		UserName:    user.Username,
		UserPhone:   user.Phone,
	})
	if err != nil {
		return nil, err
	}
	return &AuthResult{
		Token:            token,
		User:             user,
		CurrentHousehold: current,
		Households:       households,
	}, nil
}

func (u *AuthUsecase) CreateHousehold(ctx context.Context, actor Actor, name string) (*AuthResult, error) {
	household, err := u.repo.CreateHouseholdForUser(ctx, actor.UserID, strings.TrimSpace(name), utils.GetSFIDBase62())
	if err != nil {
		return nil, err
	}
	user, err := u.repo.GetUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	households, err := u.repo.ListHouseholdsByUser(ctx, actor.UserID)
	if err != nil {
		return nil, err
	}
	token, err := u.tokenRepo.NewTokenWithClaims(ctx, &auth.JwtClaims{
		UserId:      actor.UserID,
		HouseholdId: household.ID,
		UserName:    user.Username,
		UserPhone:   user.Phone,
	})
	if err != nil {
		return nil, err
	}
	return &AuthResult{
		Token:            token,
		User:             user,
		CurrentHousehold: household,
		Households:       households,
	}, nil
}
