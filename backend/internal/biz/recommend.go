package biz

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/chengjiang/aicook/backend/internal/data"
)

// RecommendUsecase 实现首页"今日推荐"逻辑。
//
// 当前为 Phase A：仅启用 preferences / meal_plan / recently_cooked_penalty 三类信号。
// search_history_match 与 collaborative_filter_score 在 Phase B 数据积累后再加入，
// 接口层 (`ListTodayRecipes`) 不会因此变化，前端可无感升级。
type RecommendUsecase struct {
	recipes      *data.RecipeRepo
	households   *data.HouseholdRepo
	kitchenOps   *data.KitchenOpsRepo
	cookHistory  *data.CookingHistoryRepo
}

func NewRecommendUsecase(
	recipes *data.RecipeRepo,
	households *data.HouseholdRepo,
	kitchenOps *data.KitchenOpsRepo,
	cookHistory *data.CookingHistoryRepo,
) *RecommendUsecase {
	return &RecommendUsecase{
		recipes:     recipes,
		households:  households,
		kitchenOps:  kitchenOps,
		cookHistory: cookHistory,
	}
}

// 推荐评分参数；权重在这里集中维护，便于后续 A/B 调优时只改一处。
const (
	recommendCandidatePoolSize = 60
	recommendBaseScore         = 1.0
	weightPreferenceMatch      = 4.0
	weightMealPlanMatch        = 8.0 // 今日 meal_plan 已安排的菜直接置顶
	weightPopularityFloor      = 0.5
	penaltyRecentlyCooked      = 6.0
	recentlyCookedDays         = 3
	penaltyRestriction         = 30.0
)

// TodayRecipeReason 描述某条菜谱被推荐的具体命中理由（按权重降序）。
type TodayRecipeReason struct {
	Kind  string
	Label string
}

// TodayRecipe 推荐项：菜谱 + 综合得分 + 命中理由列表。
type TodayRecipe struct {
	Recipe  *data.Recipe
	Score   float64
	Reasons []TodayRecipeReason
}

// ListToday 返回当前用户的今日推荐列表，长度不超过 limit；不足时尽量返回已有的菜谱。
func (u *RecommendUsecase) ListToday(ctx context.Context, actor Actor, limit int) ([]*TodayRecipe, error) {
	if limit <= 0 {
		limit = 8
	}
	if limit > 30 {
		limit = 30
	}

	// 候选池：拉取该 household 的已发布菜谱，按更新时间倒序，避免遍历整个表。
	candidates, err := u.recipes.ListLatest(ctx, actor.HouseholdID, recommendCandidatePoolSize, "", "", true, "published")
	if err != nil {
		return nil, err
	}
	if len(candidates) == 0 {
		return nil, nil
	}

	// 偏好信号：household.preferences 中的 flavor + scenarios 用作正向偏好；
	// restrictions 作为忌口，命中后强降权。max_difficulty / max_minutes 暂不用于打分。
	prefTags := map[string]struct{}{}
	restrictionTags := map[string]struct{}{}
	if u.households != nil {
		if hh, herr := u.households.GetHousehold(ctx, actor.HouseholdID); herr == nil && hh != nil {
			for _, tag := range extractStringArray(hh.Preferences, "flavor") {
				prefTags[strings.ToLower(tag)] = struct{}{}
			}
			for _, tag := range extractStringArray(hh.Preferences, "scenarios") {
				prefTags[strings.ToLower(tag)] = struct{}{}
			}
			for _, tag := range extractStringArray(hh.Preferences, "restrictions") {
				restrictionTags[strings.ToLower(tag)] = struct{}{}
			}
			// 兼容老结构：根 key 直接放字符串数组的旧数据。
			if len(prefTags) == 0 {
				for _, tag := range extractPreferenceTags(hh.Preferences) {
					prefTags[strings.ToLower(tag)] = struct{}{}
				}
			}
		}
	}

	// 计划信号：当天 meal_plan_item.recipe_id 集合。
	planRecipeIDs := map[int64]struct{}{}
	if u.kitchenOps != nil {
		if ids := u.todayPlannedRecipeIDs(ctx, actor.HouseholdID); len(ids) > 0 {
			for _, id := range ids {
				planRecipeIDs[id] = struct{}{}
			}
		}
	}

	// 历史信号：最近 N 天做过的菜谱集合，用于降权避免重复推荐。
	recentlyCooked := map[int64]struct{}{}
	if u.cookHistory != nil {
		if ids, herr := u.cookHistory.ListRecentRecipeIDsForUser(ctx, actor.UserID, recentlyCookedDays, 50); herr == nil {
			for _, id := range ids {
				recentlyCooked[id] = struct{}{}
			}
		}
	}

	scored := make([]*TodayRecipe, 0, len(candidates))
	for _, recipe := range candidates {
		if recipe == nil {
			continue
		}
		score := recommendBaseScore + weightPopularityFloor
		reasons := make([]TodayRecipeReason, 0, 3)

		// 偏好命中：菜谱 category / scenario_tags / flavor_tags 与偏好的并集。
		if len(prefTags) > 0 {
			recipeTags := collectRecipeTags(recipe)
			matched := 0
			for _, tag := range recipeTags {
				if _, ok := prefTags[strings.ToLower(tag)]; ok {
					matched++
				}
			}
			if matched > 0 {
				score += weightPreferenceMatch * float64(matched) / float64(len(recipeTags)+1)
				reasons = append(reasons, TodayRecipeReason{Kind: "preference", Label: "和你口味相符"})
			}
		}

		// 计划命中：今日已安排 → 强提权（置顶）。
		if _, ok := planRecipeIDs[recipe.ID]; ok {
			score += weightMealPlanMatch
			reasons = append(reasons, TodayRecipeReason{Kind: "meal_plan", Label: "今日计划中"})
		}

		// 最近做过 → 降权，但不直接剔除（用户可能想再做一次）。
		if _, ok := recentlyCooked[recipe.ID]; ok {
			score -= penaltyRecentlyCooked
			reasons = append(reasons, TodayRecipeReason{Kind: "recently_cooked", Label: "最近做过"})
		}

		// 忌口命中 → 强降权，避免推荐用户不能吃的食材。
		if len(restrictionTags) > 0 && recipeHasRestriction(recipe, restrictionTags) {
			score -= penaltyRestriction
		}

		scored = append(scored, &TodayRecipe{
			Recipe:  recipe,
			Score:   score,
			Reasons: reasons,
		})
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].Score == scored[j].Score {
			// 同分按更新时间倒序保证稳定。
			return scored[i].Recipe.UpdatedAt.After(scored[j].Recipe.UpdatedAt)
		}
		return scored[i].Score > scored[j].Score
	})

	if len(scored) > limit {
		scored = scored[:limit]
	}
	return scored, nil
}

// todayPlannedRecipeIDs 取本周计划里"今天"的 recipe_id 列表，读不到时返回 nil（容错降级）。
func (u *RecommendUsecase) todayPlannedRecipeIDs(ctx context.Context, householdID int64) []int64 {
	weekStart := startOfISOWeek(time.Now())
	plan, items, err := u.kitchenOps.GetMealPlanByWeek(ctx, householdID, weekStart)
	if err != nil || plan == nil || len(items) == 0 {
		return nil
	}
	today := time.Now().UTC()
	todayDate := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	out := make([]int64, 0, len(items))
	for _, item := range items {
		if item == nil || item.RecipeID == nil || *item.RecipeID == 0 {
			continue
		}
		planDate := time.Date(item.PlanDate.Year(), item.PlanDate.Month(), item.PlanDate.Day(), 0, 0, 0, 0, time.UTC)
		if planDate.Equal(todayDate) {
			out = append(out, *item.RecipeID)
		}
	}
	return out
}

// startOfISOWeek 返回本周一 00:00:00 UTC。与现有 meal_plan 落库的 week_start_date 语义保持一致。
func startOfISOWeek(t time.Time) time.Time {
	utc := t.UTC()
	weekday := int(utc.Weekday())
	if weekday == 0 {
		weekday = 7 // 把周日视为 7，方便回退到上周一
	}
	monday := utc.AddDate(0, 0, -(weekday - 1))
	return time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
}

// extractStringArray 从 preferences 中按 key 取字符串数组，兼容 nil/非数组的情况。
func extractStringArray(preferences map[string]any, key string) []string {
	if preferences == nil {
		return nil
	}
	value, ok := preferences[key]
	if !ok {
		return nil
	}
	switch v := value.(type) {
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				t := strings.TrimSpace(s)
				if t != "" {
					out = append(out, t)
				}
			}
		}
		return out
	case []string:
		out := make([]string, 0, len(v))
		for _, s := range v {
			t := strings.TrimSpace(s)
			if t != "" {
				out = append(out, t)
			}
		}
		return out
	}
	return nil
}

// recipeHasRestriction 检查菜谱标题/标签是否命中忌口集合。
// MVP 阶段只看显式标签，不深入到 ingredient 表（避免 N+1 查询）；
// 后续如果需要更精确，可改为预加载 ingredients 后逐项匹配。
func recipeHasRestriction(recipe *data.Recipe, restrictions map[string]struct{}) bool {
	if recipe == nil || len(restrictions) == 0 {
		return false
	}
	title := strings.ToLower(recipe.Title)
	for r := range restrictions {
		if strings.Contains(title, r) {
			return true
		}
	}
	for _, tag := range collectRecipeTags(recipe) {
		if _, ok := restrictions[strings.ToLower(tag)]; ok {
			return true
		}
	}
	return false
}

// extractPreferenceTags 从 household.preferences (JSONB) 中提取所有可能用于打分的偏好标签。
// 兼容三种历史结构：纯字符串数组、按维度分组（flavor/scenario/style 等）、或者带 enabled/value 的对象数组。
func extractPreferenceTags(preferences map[string]any) []string {
	if len(preferences) == 0 {
		return nil
	}
	out := make([]string, 0, 8)
	for _, value := range preferences {
		out = append(out, flattenPreferenceValue(value)...)
	}
	return uniqueLowerStrings(out)
}

func flattenPreferenceValue(value any) []string {
	switch v := value.(type) {
	case string:
		t := strings.TrimSpace(v)
		if t != "" {
			return []string{t}
		}
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, flattenPreferenceValue(item)...)
		}
		return out
	case map[string]any:
		// 形如 { flavor: ["麻辣"], constraints: ["低盐"] } 或 { value: "麻辣", enabled: true }
		if enabled, ok := v["enabled"].(bool); ok && !enabled {
			return nil
		}
		if val, ok := v["value"]; ok {
			return flattenPreferenceValue(val)
		}
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, flattenPreferenceValue(item)...)
		}
		return out
	}
	return nil
}

// collectRecipeTags 把菜谱用于推荐打分的所有可比较标签收集到一起（category + flavor_tags + scenario_tags）。
func collectRecipeTags(recipe *data.Recipe) []string {
	if recipe == nil {
		return nil
	}
	tags := make([]string, 0, 8)
	if cat := strings.TrimSpace(recipe.Category); cat != "" {
		tags = append(tags, cat)
	}
	tags = append(tags, jsonTagsToStrings(recipe.FlavorTags)...)
	tags = append(tags, jsonTagsToStrings(recipe.ScenarioTags)...)
	return tags
}

// jsonTagsToStrings 把 datatypes.JSON 字符串数组解码到 []string，错误时返回空，避免在打分时 panic。
func jsonTagsToStrings(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func uniqueLowerStrings(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		t := strings.TrimSpace(item)
		if t == "" {
			continue
		}
		key := strings.ToLower(t)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	return out
}
