package data

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/utils"
)

type HouseholdRepo struct {
	db *gorm.DB
}

func NewHouseholdRepo(db *gorm.DB) *HouseholdRepo {
	return &HouseholdRepo{db: db}
}

func (r *HouseholdRepo) CreateHousehold(ctx context.Context, household *Household, member *HouseholdMember) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if household.ID == 0 {
			household.ID = utils.GetSFID()
		}
		if err := tx.Create(household).Error; err != nil {
			return err
		}
		if member != nil {
			if member.ID == 0 {
				member.ID = utils.GetSFID()
			}
			member.HouseholdID = household.ID
			if err := tx.Create(member).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *HouseholdRepo) GetHousehold(ctx context.Context, householdID int64) (*Household, error) {
	var household Household
	if err := r.db.WithContext(ctx).First(&household, "id = ?", householdID).Error; err != nil {
		return nil, err
	}
	return &household, nil
}

// HouseholdMemberWithUser 是 ListHouseholdMembers 返回的 JOIN 结果。
type HouseholdMemberWithUser struct {
	MemberID    int64
	UserID      int64
	Role        string
	DisplayName string // 真实账号用 users.display_name；虚拟成员用 hm.display_name
	Username    string
	AvatarURL   string
	Emoji       string // 仅虚拟成员有值；真实账号头像走 AvatarURL
	Preferences []byte // jsonb 原始字节，由调用方反序列化为 HouseholdPreferences
	CreatedAt   int64  // unix ms
}

// ListMembers 返回家庭成员列表（含用户信息）。按 created_at 升序，owner/admin 总在前。
//
// display_name 与 emoji 走 COALESCE：虚拟成员（user_id=0）优先用 hm.display_name；
// 真实账号 fallback users.display_name。这样前端不用关心成员是否是虚拟的。
func (r *HouseholdRepo) ListMembers(ctx context.Context, householdID int64) ([]*HouseholdMemberWithUser, error) {
	type row struct {
		MemberID    int64
		UserID      int64
		Role        string
		DisplayName string
		Username    string
		AvatarURL   string
		Emoji       string
		Preferences []byte
		CreatedAt   int64
	}
	var rows []row
	// 注意：EXTRACT(EPOCH ...) * 1000 在 PG 里返回 double precision/numeric，
	// driver 直接发字符串 "1780973851304.452" 会 scan 到 int64 失败。
	// 必须显式 ::bigint 截断小数部分。
	err := r.db.WithContext(ctx).
		Table("household_members AS hm").
		Select(`hm.id AS member_id,
			hm.user_id AS user_id,
			hm.role AS role,
			COALESCE(NULLIF(hm.display_name, ''), u.display_name, '') AS display_name,
			COALESCE(u.username, '') AS username,
			COALESCE(u.avatar_url, '') AS avatar_url,
			COALESCE(hm.emoji, '') AS emoji,
			hm.preferences AS preferences,
			(EXTRACT(EPOCH FROM hm.created_at) * 1000)::bigint AS created_at`).
		Joins("LEFT JOIN users u ON u.id = hm.user_id AND u.deleted_at IS NULL").
		Where("hm.household_id = ? AND hm.deleted_at IS NULL", householdID).
		Order("CASE hm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, hm.created_at ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]*HouseholdMemberWithUser, 0, len(rows))
	for _, r := range rows {
		out = append(out, &HouseholdMemberWithUser{
			MemberID:    r.MemberID,
			UserID:      r.UserID,
			Role:        r.Role,
			DisplayName: r.DisplayName,
			Username:    r.Username,
			AvatarURL:   r.AvatarURL,
			Emoji:       r.Emoji,
			Preferences: r.Preferences,
			CreatedAt:   r.CreatedAt,
		})
	}
	return out, nil
}

// GetMember 按 member_id 查 HouseholdMember；不存在返回 gorm.ErrRecordNotFound。
func (r *HouseholdRepo) GetMember(ctx context.Context, memberID int64) (*HouseholdMember, error) {
	var m HouseholdMember
	if err := r.db.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// GetMemberByActor 按 household + user 反查 member（用于 owner 校验）。
func (r *HouseholdRepo) GetMemberByActor(ctx context.Context, householdID, userID int64) (*HouseholdMember, error) {
	var m HouseholdMember
	if err := r.db.WithContext(ctx).
		Where("household_id = ? AND user_id = ?", householdID, userID).
		First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// CreateMember 直接插入一条 HouseholdMember（虚拟成员场景 UserID=0）。
func (r *HouseholdRepo) CreateMember(ctx context.Context, member *HouseholdMember) error {
	if member.ID == 0 {
		member.ID = utils.GetSFID()
	}
	return r.db.WithContext(ctx).Create(member).Error
}

// SoftDeleteMember 软删一条 member（设置 deleted_at）。
func (r *HouseholdRepo) SoftDeleteMember(ctx context.Context, memberID int64) error {
	return r.db.WithContext(ctx).Delete(&HouseholdMember{}, "id = ?", memberID).Error
}

// UpdateMemberPreferences 整体替换某成员的 preferences JSONB。
func (r *HouseholdRepo) UpdateMemberPreferences(ctx context.Context, memberID int64, preferences []byte) error {
	return r.db.WithContext(ctx).Model(&HouseholdMember{}).
		Where("id = ?", memberID).
		Update("preferences", preferences).Error
}

// ListPreferencesJSONByHousehold 按家庭返回所有成员 preferences 字节（推荐算法用）。
// 调用方按需反序列化。
func (r *HouseholdRepo) ListPreferencesJSONByHousehold(ctx context.Context, householdID int64) ([][]byte, error) {
	var blobs [][]byte
	rows, err := r.db.WithContext(ctx).
		Table("household_members").
		Select("preferences").
		Where("household_id = ? AND deleted_at IS NULL", householdID).
		Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		blobs = append(blobs, b)
	}
	return blobs, rows.Err()
}

func (r *HouseholdRepo) FindByShareCode(ctx context.Context, shareCode string) (*Household, error) {
	var household Household
	if err := r.db.WithContext(ctx).Where("share_code = ?", shareCode).First(&household).Error; err != nil {
		return nil, err
	}
	return &household, nil
}

func (r *HouseholdRepo) UpdateShareCode(ctx context.Context, householdID int64, shareCode string) error {
	return r.db.WithContext(ctx).Model(&Household{}).
		Where("id = ?", householdID).
		Update("share_code", shareCode).Error
}

// UpdatePreferences 把 preferences JSON 整体替换；调用方负责合并/校验。
func (r *HouseholdRepo) UpdatePreferences(ctx context.Context, householdID int64, preferences map[string]any) error {
	return r.db.WithContext(ctx).Model(&Household{}).
		Where("id = ?", householdID).
		Update("preferences", preferences).Error
}

func (r *HouseholdRepo) ListRecipePreviews(ctx context.Context, householdID int64, limit int) ([]*Recipe, error) {
	if limit <= 0 {
		limit = 24
	}
	var recipes []*Recipe
	err := r.db.WithContext(ctx).
		Where("household_id = ?", householdID).
		Order("created_at desc").
		Limit(limit).
		Find(&recipes).Error
	return recipes, err
}

func (r *HouseholdRepo) ListKitchenTags(ctx context.Context, householdID int64) ([]*KitchenTag, error) {
	var tags []*KitchenTag
	err := r.db.WithContext(ctx).
		Where("household_id = ? OR type = 1", householdID).
		Order("type asc, created_at asc").
		Find(&tags).Error
	return tags, err
}

func (r *HouseholdRepo) CreateKitchenTag(ctx context.Context, tag *KitchenTag) error {
	if tag.ID == 0 {
		tag.ID = utils.GetSFID()
	}
	return r.db.WithContext(ctx).Create(tag).Error
}

var ErrKitchenTagNotMutable = errors.New("kitchen tag not found or not editable")

func (r *HouseholdRepo) UpdateKitchenTag(ctx context.Context, householdID, tagID int64, name, icon, color string) (*KitchenTag, error) {
	var updated *KitchenTag
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tag, err := r.findMutableKitchenTagTx(tx, householdID, tagID)
		if err != nil {
			return err
		}
		tag.Name = name
		tag.Icon = icon
		tag.Color = color
		if err := tx.Save(tag).Error; err != nil {
			return err
		}
		updated = tag
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (r *HouseholdRepo) findMutableKitchenTagTx(tx *gorm.DB, householdID, tagID int64) (*KitchenTag, error) {
	var tag KitchenTag
	err := tx.Where("id = ? AND household_id = ? AND type = ?", tagID, householdID, 2).First(&tag).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrKitchenTagNotMutable
		}
		return nil, err
	}
	return &tag, nil
}

func (r *HouseholdRepo) DeleteKitchenTag(ctx context.Context, householdID, tagID int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := r.findMutableKitchenTagTx(tx, householdID, tagID); err != nil {
			return err
		}
		if err := tx.Unscoped().Where("kitchen_tag_id = ?", tagID).Delete(&RecipeKitchenTag{}).Error; err != nil {
			return err
		}
		return tx.Unscoped().Delete(&KitchenTag{}, tagID).Error
	})
}

func (r *HouseholdRepo) FindKitchenTagByName(ctx context.Context, householdID int64, name string) (*KitchenTag, error) {
	var tag KitchenTag
	if err := r.db.WithContext(ctx).
		Where("(household_id = ? OR type = 1) and name = ?", householdID, name).
		First(&tag).Error; err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *HouseholdRepo) FindKitchenTagByID(ctx context.Context, householdID, tagID int64) (*KitchenTag, error) {
	var tag KitchenTag
	if err := r.db.WithContext(ctx).
		Where("(household_id = ? OR type = 1) and id = ?", householdID, tagID).
		First(&tag).Error; err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *HouseholdRepo) ImportRecipes(ctx context.Context, sourceHouseholdID, targetHouseholdID, targetUserID int64, recipeIDs []int64, kitchenTagName string) ([]*Recipe, error) {
	if len(recipeIDs) == 0 {
		return nil, nil
	}

	var imported []*Recipe
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var sources []*Recipe
		if err := tx.Where("household_id = ? AND id IN ?", sourceHouseholdID, recipeIDs).Find(&sources).Error; err != nil {
			return err
		}
		for _, src := range sources {
			var ingredients []*RecipeIngredient
			if err := tx.Where("recipe_id = ?", src.ID).Order("sort_order asc").Find(&ingredients).Error; err != nil {
				return err
			}
			var steps []*RecipeStep
			if err := tx.Where("recipe_id = ?", src.ID).Order("step_no asc").Find(&steps).Error; err != nil {
				return err
			}

			cloned := cloneRecipe(src, targetHouseholdID, targetUserID, kitchenTagName)
			if err := tx.Create(cloned).Error; err != nil {
				return err
			}

			for _, ingredient := range ingredients {
				copyItem := *ingredient
				copyItem.ID = utils.GetSFID()
				copyItem.RecipeID = cloned.ID
				if err := tx.Create(&copyItem).Error; err != nil {
					return err
				}
			}
			for _, step := range steps {
				copyItem := *step
				copyItem.ID = utils.GetSFID()
				copyItem.RecipeID = cloned.ID
				if err := tx.Create(&copyItem).Error; err != nil {
					return err
				}
			}
			imported = append(imported, cloned)
		}
		return nil
	})
	return imported, err
}

func cloneRecipe(src *Recipe, targetHouseholdID, targetUserID int64, kitchenTagName string) *Recipe {
	scenarioTags := jsonArrayToStrings(src.ScenarioTags)
	if name := strings.TrimSpace(kitchenTagName); name != "" && !containsString(scenarioTags, name) {
		scenarioTags = append([]string{name}, scenarioTags...)
	}
	scenarioTagsJSON, _ := json.Marshal(scenarioTags)
	toolsJSON, _ := json.Marshal(jsonArrayToStrings(src.Tools))
	flavorJSON, _ := json.Marshal(jsonArrayToStrings(src.FlavorTags))

	cloned := *src
	cloned.ID = utils.GetSFID()
	cloned.HouseholdID = targetHouseholdID
	cloned.OwnerUserID = targetUserID
	cloned.SourceHouseholdID = &src.HouseholdID
	cloned.ForkedFromRecipeID = &src.ID
	cloned.ScenarioTags = scenarioTagsJSON
	cloned.Tools = toolsJSON
	cloned.FlavorTags = flavorJSON
	if strings.TrimSpace(cloned.Category) == "" && strings.TrimSpace(kitchenTagName) != "" {
		cloned.Category = strings.TrimSpace(kitchenTagName)
	}
	return &cloned
}

func jsonArrayToStrings(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var items []string
	_ = json.Unmarshal(raw, &items)
	return items
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
