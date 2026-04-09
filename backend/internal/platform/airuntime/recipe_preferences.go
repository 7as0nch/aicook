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

	airtool "github.com/chengjiang/aicook/backend/internal/platform/airuntime/tool"
)

// generateRecipePreferencePlan 用轻量结构化提示生成“逐题提问”方案，
// 避免把问题固定死成口味/耗时/难度/风格四连问。
func (r *Runtime) generateRecipePreferencePlan(
	ctx context.Context,
	query string,
	preferences airtool.TextRecipePreferences,
) (*airtool.RecipePreferencePlan, error) {
	model, _, err := r.selectChatModel(false)
	if err != nil {
		return nil, err
	}

	promptCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	message, err := r.generateMessage(promptCtx, model, buildRecipePreferencePlanMessages(query, preferences), append(
		r.buildCallOptionsFromContext(ctx),
		einomodel.WithTemperature(0.4),
	)...)
	if err != nil {
		return nil, err
	}
	if message == nil {
		return nil, fmt.Errorf("recipe preference plan is empty")
	}
	return parseRecipePreferencePlan(message.Content)
}

func buildRecipePreferencePlanMessages(query string, preferences airtool.TextRecipePreferences) []*schema.Message {
	known := []string{
		fmt.Sprintf("- 已知口味：%s", preferenceFallback(preferences.Flavor)),
		fmt.Sprintf("- 已知耗时：%s", preferenceFallback(preferences.Duration)),
		fmt.Sprintf("- 已知难度：%s", preferenceFallback(preferences.Difficulty)),
		fmt.Sprintf("- 已知风格：%s", preferenceFallback(preferences.Style)),
	}
	if len(preferences.Constraints) > 0 {
		known = append(known, fmt.Sprintf("- 额外约束：%s", strings.Join(preferences.Constraints, "；")))
	}

	return []*schema.Message{
		{
			Role: schema.System,
			Content: `你是 AICook 的偏好追问助手。你的目标是：围绕用户想做的菜，生成一组“必要且紧凑”的追问。

要求：
1. 只输出合法 JSON，不要输出解释。
2. 最多 5 个问题；如果信息已经足够，可以少于 5 个，甚至输出空 questions。
3. 每个问题最多 4 个选项。
4. 问题必须贴合当前菜，不要机械复读“口味/耗时/难度/风格”四项。
5. selection_mode 只能是 single 或 multi。
6. preference_key 只能是 flavor、duration、difficulty、style、constraint 五种之一。
7. 如果是多选题，优先用于额外约束或配菜/口感方向，不要所有题都用 multi。
8. 问题应该帮助后续生成更贴近用户预期的家庭菜谱。

严格使用以下 JSON：
{
  "questions": [
    {
      "id": "",
      "prompt": "",
      "selection_mode": "single",
      "options": [
        {
          "id": "",
          "title": "",
          "summary": "",
          "preference_key": "constraint",
          "value": ""
        }
      ]
    }
  ]
}`,
		},
		{
			Role: schema.User,
			Content: fmt.Sprintf("用户想做的菜：%s\n\n已知偏好：\n%s", strings.TrimSpace(query), strings.Join(known, "\n")),
		},
	}
}

func parseRecipePreferencePlan(raw string) (*airtool.RecipePreferencePlan, error) {
	body := strings.TrimSpace(raw)
	if body == "" {
		return &airtool.RecipePreferencePlan{}, nil
	}
	if !strings.HasPrefix(body, "{") {
		re := regexp.MustCompile(`(?s)\{.*\}`)
		body = re.FindString(body)
	}
	if strings.TrimSpace(body) == "" {
		return &airtool.RecipePreferencePlan{}, nil
	}
	var plan airtool.RecipePreferencePlan
	if err := json.Unmarshal([]byte(body), &plan); err != nil {
		return nil, err
	}
	return &plan, nil
}

func preferenceFallback(value string) string {
	if strings.TrimSpace(value) == "" {
		return "未指定"
	}
	return strings.TrimSpace(value)
}
