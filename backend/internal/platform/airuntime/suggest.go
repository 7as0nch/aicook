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

// DishSuggestion AI 按现有食材+家庭口味即兴推荐的一道菜（只有名称+理由，不含完整做法）。
type DishSuggestion struct {
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// SuggestDishes 让模型根据现有食材与家庭口味，推荐 n 道新菜（仅菜名+一句理由，不生成完整做法）。
// 仅输出 JSON 数组；解析失败时返回 nil（调用方据此降级为只用库内匹配）。
func (r *Runtime) SuggestDishes(ctx context.Context, ingredients []string, tastes string, n int, excludeTitles []string) ([]DishSuggestion, error) {
	if n <= 0 {
		return nil, nil
	}
	model := r.textModel
	if model == nil {
		model = r.multimodalModel
	}
	if model == nil {
		return nil, fmt.Errorf("chat model is not configured")
	}

	ing := strings.Join(ingredients, "、")
	if strings.TrimSpace(ing) == "" {
		ing = "（未提供食材，可发挥家常菜）"
	}
	taste := strings.TrimSpace(tastes)
	if taste == "" {
		taste = "无特别偏好"
	}
	exclude := strings.Join(excludeTitles, "、")
	if strings.TrimSpace(exclude) == "" {
		exclude = "（无）"
	}

	prompt := fmt.Sprintf(`你是 AICook 的家常菜推荐助手。请根据现有食材和家庭口味，推荐 %d 道适合的家常菜。
现有食材：%s
家庭口味：%s
已推荐（请避开，换不同的菜）：%s

要求：
- 尽量用上现有食材，并贴合家庭口味与忌口。
- 只输出 JSON 数组，每项形如 {"title":"菜名","reason":"一句话推荐理由（≤20字）"}，不要输出别的内容。`, n, ing, taste, exclude)

	// 限时调用：AI 慢时上层 RecommendDishes 会降级为只返回库内匹配，避免把整个请求拖到客户端超时。
	callCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	msg, err := r.generateMessage(callCtx, model, []*schema.Message{
		{Role: schema.System, Content: "你只输出合法 JSON 数组，不要补充任何解释或代码块标记。"},
		{Role: schema.User, Content: prompt},
	}, einomodel.WithTemperature(0.6))
	if err != nil {
		return nil, err
	}
	return parseDishSuggestions(msg.Content), nil
}

func parseDishSuggestions(raw string) []DishSuggestion {
	body := strings.TrimSpace(raw)
	if !json.Valid([]byte(body)) {
		// 容错：从可能夹带的文字/代码块中抽出 JSON 数组
		re := regexp.MustCompile(`(?s)\[.*\]`)
		body = re.FindString(body)
	}
	if !json.Valid([]byte(body)) {
		return nil
	}
	var out []DishSuggestion
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		return nil
	}
	res := make([]DishSuggestion, 0, len(out))
	for _, d := range out {
		title := strings.TrimSpace(d.Title)
		if title == "" {
			continue
		}
		res = append(res, DishSuggestion{Title: title, Reason: strings.TrimSpace(d.Reason)})
	}
	return res
}
