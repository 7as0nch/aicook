package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/utils"
)

type HouseholdUsecase struct {
	repo *data.HouseholdRepo
}

func NewHouseholdUsecase(repo *data.HouseholdRepo) *HouseholdUsecase {
	return &HouseholdUsecase{repo: repo}
}

// HouseholdPreferences 与 proto.HouseholdPreferences 字段对齐，作为 biz 层的纯结构。
type HouseholdPreferences struct {
	Flavor        []string
	Scenarios     []string
	Restrictions  []string
	MaxDifficulty int
	MaxMinutes    int
}

// GetPreferences 读取当前家庭的偏好。读不到时返回零值（不报错）。
func (u *HouseholdUsecase) GetPreferences(ctx context.Context, actor Actor) (*HouseholdPreferences, error) {
	hh, err := u.repo.GetHousehold(ctx, actor.HouseholdID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &HouseholdPreferences{}, nil
		}
		return nil, err
	}
	return preferencesFromJSON(hh.Preferences), nil
}

// MemberDetail 包含家庭成员展示需要的信息（用于"我的"页家庭口味区）。
type MemberDetail struct {
	ID          int64
	UserID      int64
	Role        string
	DisplayName string
	Username    string
	AvatarURL   string
	Emoji       string
	FlavorTags  []string
}

// ListMembers 列出指定家庭的成员。家庭口味缺省时用 household 维度的偏好兜底。
func (u *HouseholdUsecase) ListMembers(ctx context.Context, actor Actor, householdID int64) ([]*MemberDetail, error) {
	if householdID <= 0 {
		householdID = actor.HouseholdID
	}
	// 只允许查自己所在的家庭
	if householdID != actor.HouseholdID {
		return nil, errors.New("forbidden: household_id mismatch")
	}
	rows, err := u.repo.ListMembers(ctx, householdID)
	if err != nil {
		return nil, err
	}
	// 拉家庭口味做兜底
	var fallbackFlavor []string
	if hh, err := u.repo.GetHousehold(ctx, householdID); err == nil && hh != nil {
		prefs := preferencesFromJSON(hh.Preferences)
		fallbackFlavor = prefs.Flavor
	}
	out := make([]*MemberDetail, 0, len(rows))
	for _, r := range rows {
		emoji := defaultEmojiByRole(r.Role, r.MemberID)
		out = append(out, &MemberDetail{
			ID:          r.MemberID,
			UserID:      r.UserID,
			Role:        r.Role,
			DisplayName: strings.TrimSpace(r.DisplayName),
			Username:    strings.TrimSpace(r.Username),
			Emoji:       emoji,
			FlavorTags:  append([]string(nil), fallbackFlavor...),
		})
	}
	return out, nil
}

// defaultEmojiByRole 根据角色/成员 id 给一个默认 emoji（user metadata 里有 avatar_emoji 时取真实的）。
func defaultEmojiByRole(role string, id int64) string {
	pool := []string{"🐱", "😺", "👵", "👴", "👶", "👩‍🍳", "👨‍🍳"}
	if id <= 0 {
		return "🐱"
	}
	idx := int(id%int64(len(pool)) + int64(len(pool))) % len(pool)
	return pool[idx]
}

// UpdatePreferences 整体替换 preferences。
func (u *HouseholdUsecase) UpdatePreferences(ctx context.Context, actor Actor, prefs *HouseholdPreferences) (*HouseholdPreferences, error) {
	if prefs == nil {
		prefs = &HouseholdPreferences{}
	}
	payload := map[string]any{
		"flavor":         uniqueTrimmedTags(prefs.Flavor),
		"scenarios":      uniqueTrimmedTags(prefs.Scenarios),
		"restrictions":   uniqueTrimmedTags(prefs.Restrictions),
		"max_difficulty": clampInt(prefs.MaxDifficulty, 0, 5),
		"max_minutes":    clampInt(prefs.MaxMinutes, 0, 600),
	}
	if err := u.repo.UpdatePreferences(ctx, actor.HouseholdID, payload); err != nil {
		return nil, err
	}
	return preferencesFromJSON(payload), nil
}

func preferencesFromJSON(raw map[string]any) *HouseholdPreferences {
	out := &HouseholdPreferences{}
	if raw == nil {
		return out
	}
	out.Flavor = uniqueTrimmedTags(jsonAnyToStrings(raw["flavor"]))
	out.Scenarios = uniqueTrimmedTags(jsonAnyToStrings(raw["scenarios"]))
	out.Restrictions = uniqueTrimmedTags(jsonAnyToStrings(raw["restrictions"]))
	out.MaxDifficulty = clampInt(int(coerceJSONNumber(raw["max_difficulty"])), 0, 5)
	out.MaxMinutes = clampInt(int(coerceJSONNumber(raw["max_minutes"])), 0, 600)
	return out
}

func jsonAnyToStrings(value any) []string {
	switch v := value.(type) {
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return append([]string(nil), v...)
	}
	return nil
}

func coerceJSONNumber(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int32:
		return float64(v)
	case int64:
		return float64(v)
	}
	return 0
}

func uniqueTrimmedTags(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		t := strings.TrimSpace(item)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func (u *HouseholdUsecase) CreateHousehold(ctx context.Context, actor Actor, name string) (*data.Household, error) {
	household := &data.Household{
		BaseModel: data.BaseModel{ID: utils.GetSFID()},
		Name:      strings.TrimSpace(name),
		ShareCode: utils.GetSFIDBase62(),
		Timezone:  "Asia/Shanghai",
	}
	member := &data.HouseholdMember{
		BaseModel: data.BaseModel{ID: utils.GetSFID()},
		UserID:    actor.UserID,
		Role:      "owner",
	}
	if err := u.repo.CreateHousehold(ctx, household, member); err != nil {
		return nil, err
	}
	return household, nil
}

func (u *HouseholdUsecase) CreateShareCode(ctx context.Context, actor Actor) (*data.Household, error) {
	household, err := u.repo.GetHousehold(ctx, actor.HouseholdID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(household.ShareCode) == "" {
		household.ShareCode = utils.GetSFIDBase62()
		if err := u.repo.UpdateShareCode(ctx, household.ID, household.ShareCode); err != nil {
			return nil, err
		}
	}
	return household, nil
}

func (u *HouseholdUsecase) GetKitchenByShareCode(ctx context.Context, shareCode string) (*data.Household, []*data.Recipe, error) {
	household, err := u.repo.FindByShareCode(ctx, strings.TrimSpace(shareCode))
	if err != nil {
		return nil, nil, err
	}
	recipes, err := u.repo.ListRecipePreviews(ctx, household.ID, 24)
	if err != nil {
		return nil, nil, err
	}
	return household, recipes, nil
}

func (u *HouseholdUsecase) ImportSharedRecipes(ctx context.Context, actor Actor, shareCode string, recipeIDs []int64, kitchenTagID *int64, kitchenTagName string) ([]*data.Recipe, *data.KitchenTag, error) {
	source, err := u.repo.FindByShareCode(ctx, strings.TrimSpace(shareCode))
	if err != nil {
		return nil, nil, err
	}
	if source.ID == actor.HouseholdID {
		return nil, nil, fmt.Errorf("cannot import from current household")
	}

	var tag *data.KitchenTag
	trimmedName := strings.TrimSpace(kitchenTagName)
	if kitchenTagID != nil && *kitchenTagID > 0 {
		tag, err = u.repo.FindKitchenTagByID(ctx, actor.HouseholdID, *kitchenTagID)
		if err != nil {
			return nil, nil, err
		}
		trimmedName = tag.Name
	} else if trimmedName != "" {
		tag, err = u.repo.FindKitchenTagByName(ctx, actor.HouseholdID, trimmedName)
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				tag = &data.KitchenTag{
					BaseModel:   data.BaseModel{ID: utils.GetSFID()},
					HouseholdID: actor.HouseholdID,
					Name:        trimmedName,
					Icon:        "folder-plus",
					Color:       "orange",
				}
				if createErr := u.repo.CreateKitchenTag(ctx, tag); createErr != nil {
					return nil, nil, createErr
				}
			} else {
				return nil, nil, err
			}
		}
	}

	recipes, err := u.repo.ImportRecipes(ctx, source.ID, actor.HouseholdID, actor.UserID, recipeIDs, trimmedName)
	if err != nil {
		return nil, nil, err
	}
	return recipes, tag, nil
}

func (u *HouseholdUsecase) ListKitchenTags(ctx context.Context, actor Actor) ([]*data.KitchenTag, error) {
	return u.repo.ListKitchenTags(ctx, actor.HouseholdID)
}

func (u *HouseholdUsecase) CreateKitchenTag(ctx context.Context, actor Actor, name, icon, color string) (*data.KitchenTag, error) {
	tag := &data.KitchenTag{
		BaseModel:   data.BaseModel{ID: utils.GetSFID()},
		HouseholdID: actor.HouseholdID,
		Name:        strings.TrimSpace(name),
		Icon:        strings.TrimSpace(icon),
		Color:       strings.TrimSpace(color),
		Type:        2,
	}
	if tag.Icon == "" {
		tag.Icon = "folder"
	}
	if tag.Color == "" {
		tag.Color = "orange"
	}
	if err := u.repo.CreateKitchenTag(ctx, tag); err != nil {
		if isPostgresUniqueViolation(err) {
			return nil, fmt.Errorf("已存在同名厨房标签")
		}
		return nil, err
	}
	return tag, nil
}

func (u *HouseholdUsecase) UpdateKitchenTag(ctx context.Context, actor Actor, tagID int64, name, icon, color string) (*data.KitchenTag, error) {
	if tagID <= 0 {
		return nil, fmt.Errorf("invalid kitchen tag id")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("kitchen tag name is required")
	}
	icon = strings.TrimSpace(icon)
	color = strings.TrimSpace(color)
	if icon == "" {
		icon = "folder"
	}
	if color == "" {
		color = "orange"
	}
	tag, err := u.repo.UpdateKitchenTag(ctx, actor.HouseholdID, tagID, name, icon, color)
	if err != nil {
		if errors.Is(err, data.ErrKitchenTagNotMutable) {
			return nil, fmt.Errorf("无权修改或标签不存在")
		}
		if isPostgresUniqueViolation(err) {
			return nil, fmt.Errorf("已存在同名厨房标签")
		}
		return nil, err
	}
	return tag, nil
}

func (u *HouseholdUsecase) DeleteKitchenTag(ctx context.Context, actor Actor, tagID int64) error {
	if tagID <= 0 {
		return fmt.Errorf("invalid kitchen tag id")
	}
	if err := u.repo.DeleteKitchenTag(ctx, actor.HouseholdID, tagID); err != nil {
		if errors.Is(err, data.ErrKitchenTagNotMutable) {
			return fmt.Errorf("无权删除或标签不存在")
		}
		return err
	}
	return nil
}

func isPostgresUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "23505") || strings.Contains(strings.ToLower(msg), "duplicate key") ||
		strings.Contains(strings.ToLower(msg), "unique constraint")
}
