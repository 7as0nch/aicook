package airtool

import (
	"context"
	"fmt"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
)

type SaveHouseholdMemoryArgs struct {
	Content string `json:"content"`
	Scope   string `json:"scope,omitempty"`
}

func NewSaveHouseholdMemoryTool(save func(context.Context, string, string) error) (einotool.BaseTool, error) {
	return toolutils.InferTool("save_household_memory", "将用户要求长期记住的饮食偏好、禁忌或家庭规则写入家庭记忆。content 为简洁可检索的一句或多句中文；scope 可选 preference（口味偏好）、dietary（过敏/禁忌）、general（其他）。", func(ctx context.Context, input SaveHouseholdMemoryArgs) (string, error) {
		content := strings.TrimSpace(input.Content)
		if content == "" {
			return "", fmt.Errorf("memory content is empty")
		}
		scope := strings.TrimSpace(strings.ToLower(input.Scope))
		if scope == "" {
			scope = "general"
		}
		switch scope {
		case "preference", "dietary", "general":
		default:
			scope = "general"
		}
		if err := save(ctx, scope, content); err != nil {
			return "", err
		}
		prev := content
		if len([]rune(prev)) > 120 {
			prev = string([]rune(prev)[:120]) + "..."
		}
		return marshal(map[string]any{"ok": true, "scope": scope, "preview": prev})
	})
}
