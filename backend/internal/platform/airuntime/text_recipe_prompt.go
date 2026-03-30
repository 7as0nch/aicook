package airuntime

import (
	"context"
	"fmt"
	"strings"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

func (r *Runtime) generateTextRecipeDraft(ctx context.Context, query string, sources []Source, preferences TextRecipePreferences) (*TextRecipeDraft, error) {
	model, _, err := r.selectChatModel(false)
	if err != nil {
		return nil, err
	}
	message, err := r.generateMessage(ctx, model, buildTextRecipeDraftMessages(query, sources, preferences), append(buildCallOptions(ReplyRequest{}), einomodel.WithTemperature(0.3))...)
	if err != nil {
		return nil, err
	}
	if message == nil {
		return nil, fmt.Errorf("text recipe draft response is empty")
	}
	return parseTextRecipeDraftJSON(message.Content)
}

func buildTextRecipeDraftMessages(query string, sources []Source, preferences TextRecipePreferences) []*schema.Message {
	sourceLines := make([]string, 0, len(sources))
	for _, item := range sources {
		line := strings.TrimSpace(item.Title)
		if snippet := strings.TrimSpace(item.Snippet); snippet != "" {
			if line != "" {
				line += "："
			}
			line += snippet
		}
		if line == "" {
			line = strings.TrimSpace(item.DocumentID)
		}
		if line != "" {
			sourceLines = append(sourceLines, "- "+line)
		}
	}
	if len(sourceLines) == 0 {
		sourceLines = append(sourceLines, "- 当前没有额外资料，请基于常见家常做法生成可靠版本。")
	}
	preferenceLines := []string{
		fmt.Sprintf("- 口味偏好：%s", fallbackPreferenceText(preferences.Flavor, "未指定")),
		fmt.Sprintf("- 耗时偏好：%s", fallbackPreferenceText(preferences.Duration, "未指定")),
		fmt.Sprintf("- 难度偏好：%s", fallbackPreferenceText(preferences.Difficulty, "未指定")),
		fmt.Sprintf("- 风格偏好：%s", fallbackPreferenceText(preferences.Style, "未指定")),
	}

	prompt := fmt.Sprintf(`你是 AICook 的中文菜谱结构化助手。请围绕“%s”输出一个适合家庭烹饪的完整菜谱 JSON，不要输出解释性文字。

要求：
1. 必须输出合法 JSON。
2. 步骤要可执行，避免空泛描述。
3. 如果步骤里出现焖、炖、蒸、腌制等耗时动作，请尽量填写 timer_seconds。
4. 难度范围为 1 到 5。
5. ingredients 和 steps 不能为空。
6. 请尽量贴合用户已确认的偏好项。
7. flavor_tags 里至少体现主要口味偏好；category 尽量给出适合当前菜谱的厨房标签名或菜系标签。

请严格使用以下 JSON 结构：
{
  "title": "",
  "summary": "",
  "category": "",
  "cover_image_url": "",
  "total_minutes": 0,
  "difficulty": 1,
  "tools": [],
  "scenario_tags": [],
  "flavor_tags": [],
  "ingredients": [{"group_name":"","name":"","amount_text":"","preparation":""}],
  "steps": [{"title":"","description":"","step_type":"cook","need_timer":false,"timer_seconds":0,"timer_animation":"ring","end_condition":""}]
}

用户偏好：
%s

可参考资料：
%s`, query, strings.Join(preferenceLines, "\n"), strings.Join(sourceLines, "\n"))

	return []*schema.Message{
		{
			Role:    schema.System,
			Content: "你是 AICook 的菜谱结构化助手，只输出合法 JSON，不要补充任何解释。",
		},
		{
			Role:    schema.User,
			Content: prompt,
		},
	}
}

func fallbackPreferenceText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
