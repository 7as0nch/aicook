package airuntime

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

// MealSlotFit 表示一道菜适合作为哪几餐（可多选）。
type MealSlotFit struct {
	Breakfast bool `json:"breakfast"`
	Lunch     bool `json:"lunch"`
	Dinner    bool `json:"dinner"`
}

// ClassifyMealSlots 让模型判断每道菜适合作为早/午/晚餐中的哪些。
// 用于「一键生成本周计划」按餐次配菜，避免把重口正餐排到早餐。
// 返回 map[菜名]MealSlotFit；模型未配置/解析失败时返回 nil，调用方据此走启发式兜底。
func (r *Runtime) ClassifyMealSlots(ctx context.Context, titles []string) (map[string]MealSlotFit, error) {
	// 去空去重，控制 prompt 规模
	seen := map[string]struct{}{}
	list := make([]string, 0, len(titles))
	for _, t := range titles {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		list = append(list, t)
	}
	if len(list) == 0 {
		return map[string]MealSlotFit{}, nil
	}

	model := r.textModel
	if model == nil {
		model = r.multimodalModel
	}
	if model == nil {
		return nil, fmt.Errorf("chat model is not configured")
	}

	prompt := fmt.Sprintf(`你是配餐助手。判断下面每道菜适合作为「早餐 / 午餐 / 晚餐」中的哪些（可多选）。
判断原则：
- 早餐：清淡、快手、易消化（如粥、蛋、面点、豆浆、三明治、小菜）；油腻、重口、大荤的正餐菜不适合早餐。
- 午餐 / 晚餐：以正餐为主，多数家常菜都适合；午餐可稍丰盛，晚餐可稍清淡。
- 每道菜至少归入一餐。
菜名列表：%s

只输出 JSON 对象：键是菜名，值形如 {"breakfast":true,"lunch":false,"dinner":true}，不要输出别的内容。`, strings.Join(list, "、"))

	// 限时调用：失败/超时由上层 RankForPlan 走启发式兜底，不阻塞「一键生成」。
	// 12s 给客户端默认 30s 超时留足余量（分类任务很小，正常几秒内返回）。
	callCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	msg, err := r.generateMessage(callCtx, model, []*schema.Message{
		{Role: schema.System, Content: "你只输出合法 JSON 对象，不要补充任何解释或代码块标记。"},
		{Role: schema.User, Content: prompt},
	}, einomodel.WithTemperature(0.2))
	if err != nil {
		return nil, err
	}
	return parseMealSlotFits(msg.Content), nil
}

func parseMealSlotFits(raw string) map[string]MealSlotFit {
	body := strings.TrimSpace(raw)
	if !json.Valid([]byte(body)) {
		// 容错：从夹带文字/代码块中抽出 JSON 对象
		re := regexp.MustCompile(`(?s)\{.*\}`)
		body = re.FindString(body)
	}
	if !json.Valid([]byte(body)) {
		return nil
	}
	var out map[string]MealSlotFit
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		return nil
	}
	res := make(map[string]MealSlotFit, len(out))
	for k, v := range out {
		key := strings.TrimSpace(k)
		if key == "" {
			continue
		}
		res[key] = v
	}
	return res
}
