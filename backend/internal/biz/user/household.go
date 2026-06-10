package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/biz/common"
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
func (u *HouseholdUsecase) GetPreferences(ctx context.Context, actor common.Actor) (*HouseholdPreferences, error) {
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

// ListMembers 列出指定家庭的成员。每个成员的 flavor_tags：
//   - 优先用 hm.preferences.flavor（成员个人口味）
//   - 个人空则 fallback household-level preferences.flavor
func (u *HouseholdUsecase) ListMembers(ctx context.Context, actor common.Actor, householdID int64) ([]*MemberDetail, error) {
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
		emoji := strings.TrimSpace(r.Emoji)
		if emoji == "" {
			emoji = defaultEmojiByRole(r.Role, r.MemberID)
		}
		// 解析成员个人 preferences
		var memberFlavor []string
		if len(r.Preferences) > 0 {
			memberPrefs := parseMemberPreferences(r.Preferences)
			if len(memberPrefs.Flavor) > 0 {
				memberFlavor = memberPrefs.Flavor
			}
		}
		// 兜底策略：
		//   - 真实账号（user_id>0）：未设置个人口味时 → 用家庭口味兜底（保留旧行为）
		//   - 虚拟成员（user_id=0）：未设置就显示空，UI 显示「未设置口味偏好」
		//     避免把 owner 设的家庭口味"伪装"成虚拟成员自己的偏好误导用户。
		if len(memberFlavor) == 0 && r.UserID > 0 {
			memberFlavor = fallbackFlavor
		}
		out = append(out, &MemberDetail{
			ID:          r.MemberID,
			UserID:      r.UserID,
			Role:        r.Role,
			DisplayName: strings.TrimSpace(r.DisplayName),
			Username:    strings.TrimSpace(r.Username),
			AvatarURL:   strings.TrimSpace(r.AvatarURL),
			Emoji:       emoji,
			FlavorTags:  append([]string(nil), memberFlavor...),
		})
	}
	return out, nil
}

// AddMember 新增虚拟成员（UserID=0）。权限：仅 owner。
func (u *HouseholdUsecase) AddMember(ctx context.Context, actor common.Actor, householdID int64, displayName, emoji string, prefs *HouseholdPreferences) (*MemberDetail, error) {
	if householdID <= 0 {
		householdID = actor.HouseholdID
	}
	if householdID != actor.HouseholdID {
		return nil, errors.New("forbidden: household_id mismatch")
	}
	if err := u.requireOwner(ctx, actor); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(displayName)
	if name == "" {
		return nil, errors.New("display_name is required")
	}
	if len([]rune(name)) > 30 {
		return nil, errors.New("display_name too long")
	}
	// preferences 默认 {}（空对象）；如有传入则正规化后保存
	prefsJSON, err := encodePreferencesJSON(prefs)
	if err != nil {
		return nil, err
	}
	m := &data.HouseholdMember{
		BaseModel:       data.BaseModel{ID: utils.GetSFID()},
		HouseholdID:     householdID,
		UserID:          0,
		Role:            "member",
		DisplayName:     name,
		Emoji:           strings.TrimSpace(emoji),
		PreferencesJSON: datatypes.JSON(prefsJSON),
	}
	if err := u.repo.CreateMember(ctx, m); err != nil {
		return nil, err
	}
	out := &MemberDetail{
		ID:          m.ID,
		UserID:      0,
		Role:        m.Role,
		DisplayName: m.DisplayName,
		Emoji:       m.Emoji,
	}
	if out.Emoji == "" {
		out.Emoji = defaultEmojiByRole(m.Role, m.ID)
	}
	if prefs != nil {
		out.FlavorTags = append([]string(nil), prefs.Flavor...)
	}
	return out, nil
}

// RemoveMember 软删某成员。权限：owner only；不允许删除 owner 自己。
func (u *HouseholdUsecase) RemoveMember(ctx context.Context, actor common.Actor, memberID int64) error {
	if memberID <= 0 {
		return errors.New("member_id is required")
	}
	if err := u.requireOwner(ctx, actor); err != nil {
		return err
	}
	target, err := u.repo.GetMember(ctx, memberID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("member not found")
		}
		return err
	}
	if target.HouseholdID != actor.HouseholdID {
		return errors.New("forbidden: household_id mismatch")
	}
	if target.Role == "owner" {
		return errors.New("cannot remove owner")
	}
	return u.repo.SoftDeleteMember(ctx, memberID)
}

// GetMemberPreferences 读单个成员个人口味偏好。
// 权限：成员所在家庭的任意成员都可读（actor.HouseholdID 校验）。
func (u *HouseholdUsecase) GetMemberPreferences(ctx context.Context, actor common.Actor, memberID int64) (*HouseholdPreferences, error) {
	target, err := u.repo.GetMember(ctx, memberID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("member not found")
		}
		return nil, err
	}
	if target.HouseholdID != actor.HouseholdID {
		return nil, errors.New("forbidden: household_id mismatch")
	}
	return parseMemberPreferences([]byte(target.PreferencesJSON)), nil
}

// UpdateMemberPreferences 改单个成员口味偏好。
// 权限：owner 或 本人（member.user_id == actor.user_id 且 != 0）。
func (u *HouseholdUsecase) UpdateMemberPreferences(ctx context.Context, actor common.Actor, memberID int64, prefs *HouseholdPreferences) (*HouseholdPreferences, error) {
	target, err := u.repo.GetMember(ctx, memberID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("member not found")
		}
		return nil, err
	}
	if target.HouseholdID != actor.HouseholdID {
		return nil, errors.New("forbidden: household_id mismatch")
	}
	// 鉴权：owner 全权；或本人编辑自己（仅真实账号）
	isSelf := target.UserID > 0 && target.UserID == actor.UserID
	if !isSelf {
		if err := u.requireOwner(ctx, actor); err != nil {
			return nil, err
		}
	}
	prefsJSON, err := encodePreferencesJSON(prefs)
	if err != nil {
		return nil, err
	}
	if err := u.repo.UpdateMemberPreferences(ctx, memberID, prefsJSON); err != nil {
		return nil, err
	}
	return parseMemberPreferences(prefsJSON), nil
}

// requireOwner 校验 actor 是当前 household 的 owner。
func (u *HouseholdUsecase) requireOwner(ctx context.Context, actor common.Actor) error {
	if actor.UserID == 0 || actor.HouseholdID == 0 {
		return errors.New("unauthorized")
	}
	m, err := u.repo.GetMemberByActor(ctx, actor.HouseholdID, actor.UserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("forbidden: not a member")
		}
		return err
	}
	if m.Role != "owner" {
		return errors.New("forbidden: owner only")
	}
	return nil
}

// parseMemberPreferences 把 jsonb 原始字节解析为 HouseholdPreferences。
// 空字节返回零值；解析失败时记日志（防止 DB 被人手动改坏后悄无声息）。
func parseMemberPreferences(raw []byte) *HouseholdPreferences {
	if len(raw) == 0 {
		return &HouseholdPreferences{}
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		// 写入路径都走 encodePreferencesJSON 输出合法 JSON；这里收到非法
		// JSON 几乎只可能是有人直接改 DB 改坏了。记下来便于排查。
		log.Printf("[biz/user/household] parseMemberPreferences decode err: %v; raw=%q", err, string(raw))
		return &HouseholdPreferences{}
	}
	return preferencesFromJSON(m)
}

// encodePreferencesJSON 把 HouseholdPreferences 正规化后序列化为 jsonb 字节。
func encodePreferencesJSON(prefs *HouseholdPreferences) ([]byte, error) {
	if prefs == nil {
		return []byte("{}"), nil
	}
	payload := map[string]any{
		"flavor":         uniqueTrimmedTags(prefs.Flavor),
		"scenarios":      uniqueTrimmedTags(prefs.Scenarios),
		"restrictions":   uniqueTrimmedTags(prefs.Restrictions),
		"max_difficulty": clampInt(prefs.MaxDifficulty, 0, 5),
		"max_minutes":    clampInt(prefs.MaxMinutes, 0, 600),
	}
	return json.Marshal(payload)
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
func (u *HouseholdUsecase) UpdatePreferences(ctx context.Context, actor common.Actor, prefs *HouseholdPreferences) (*HouseholdPreferences, error) {
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

func (u *HouseholdUsecase) CreateHousehold(ctx context.Context, actor common.Actor, name string) (*data.Household, error) {
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

func (u *HouseholdUsecase) CreateShareCode(ctx context.Context, actor common.Actor) (*data.Household, error) {
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

func (u *HouseholdUsecase) ImportSharedRecipes(ctx context.Context, actor common.Actor, shareCode string, recipeIDs []int64, kitchenTagID *int64, kitchenTagName string) ([]*data.Recipe, *data.KitchenTag, error) {
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

func (u *HouseholdUsecase) ListKitchenTags(ctx context.Context, actor common.Actor) ([]*data.KitchenTag, error) {
	return u.repo.ListKitchenTags(ctx, actor.HouseholdID)
}

func (u *HouseholdUsecase) CreateKitchenTag(ctx context.Context, actor common.Actor, name, icon, color string) (*data.KitchenTag, error) {
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

func (u *HouseholdUsecase) UpdateKitchenTag(ctx context.Context, actor common.Actor, tagID int64, name, icon, color string) (*data.KitchenTag, error) {
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

func (u *HouseholdUsecase) DeleteKitchenTag(ctx context.Context, actor common.Actor, tagID int64) error {
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
