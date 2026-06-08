package data

import (
	"context"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/utils"
)

type AuthRepo struct {
	db *gorm.DB
}

func NewAuthRepo(db *gorm.DB) *AuthRepo {
	return &AuthRepo{db: db}
}

func (r *AuthRepo) CreateUserWithHousehold(ctx context.Context, household *Household, user *User, role string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if household.ID == 0 {
			household.ID = utils.GetSFID()
		}
		if err := tx.Create(household).Error; err != nil {
			return err
		}
		if user.ID == 0 {
			user.ID = utils.GetSFID()
		}
		user.HouseholdID = household.ID
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		member := &HouseholdMember{
			BaseModel:   household.BaseModel,
			HouseholdID: household.ID,
			UserID:      user.ID,
			Role:        role,
		}
		if member.ID == 0 {
			member.ID = utils.GetSFID()
		}
		return tx.Create(member).Error
	})
}

func (r *AuthRepo) FindUserByUsername(ctx context.Context, username string) (*User, error) {
	var user User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// FindUserByWxOpenid 通过微信 openid 查找用户；不存在返回 gorm.ErrRecordNotFound
func (r *AuthRepo) FindUserByWxOpenid(ctx context.Context, openid string) (*User, error) {
	var user User
	if err := r.db.WithContext(ctx).Where("wx_openid = ?", openid).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *AuthRepo) GetUser(ctx context.Context, userID int64) (*User, error) {
	var user User
	if err := r.db.WithContext(ctx).First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *AuthRepo) UpdateUser(ctx context.Context, userID int64, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(&User{}).Where("id = ?", userID).Updates(updates).Error
}

func (r *AuthRepo) GetHousehold(ctx context.Context, householdID int64) (*Household, error) {
	var household Household
	if err := r.db.WithContext(ctx).First(&household, "id = ?", householdID).Error; err != nil {
		return nil, err
	}
	return &household, nil
}

func (r *AuthRepo) ListHouseholdsByUser(ctx context.Context, userID int64) ([]*Household, error) {
	var households []*Household
	err := r.db.WithContext(ctx).
		Table("households").
		Select("households.*").
		Joins("join household_members on household_members.household_id = households.id and household_members.deleted_at is null").
		Where("household_members.user_id = ?", userID).
		Order("households.created_at asc").
		Scan(&households).Error
	return households, err
}

func (r *AuthRepo) HasMembership(ctx context.Context, userID, householdID int64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&HouseholdMember{}).
		Where("user_id = ? and household_id = ?", userID, householdID).
		Count(&count).Error
	return count > 0, err
}

func (r *AuthRepo) CreateHouseholdForUser(ctx context.Context, userID int64, name, shareCode string) (*Household, error) {
	household := &Household{
		BaseModel: BaseModel{ID: utils.GetSFID()},
		Name:      name,
		ShareCode: shareCode,
		Timezone:  "Asia/Shanghai",
	}
	member := &HouseholdMember{
		BaseModel:   BaseModel{ID: utils.GetSFID()},
		HouseholdID: household.ID,
		UserID:      userID,
		Role:        "owner",
	}
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(household).Error; err != nil {
			return err
		}
		return tx.Create(member).Error
	}); err != nil {
		return nil, err
	}
	return household, nil
}
