package airuntime

import (
	"context"
	"strings"
	"time"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

func (r *Runtime) GenerateSessionTitle(ctx context.Context, text string) (string, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", nil
	}

	model, _, err := r.selectChatModel(false)
	if err != nil {
		return "", err
	}

	titleCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	msg, err := r.generateMessage(titleCtx, model, []*schema.Message{
		{
			Role:    schema.System,
			Content: "你是 AICook 的会话标题助手。请根据用户首条消息生成一个简短中文标题，只输出标题本身，不要引号，不要句号，不要解释，控制在 6 到 14 个字。",
		},
		{
			Role:    schema.User,
			Content: text,
		},
	}, einomodel.WithTemperature(0.2))
	if err != nil {
		return "", err
	}
	return normalizeSessionTitle(msg.Content), nil
}

func normalizeSessionTitle(text string) string {
	text = strings.TrimSpace(text)
	text = strings.Trim(text, "\"'“”‘’")
	text = strings.ReplaceAll(text, "\n", "")
	text = strings.ReplaceAll(text, "\r", "")
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) > 16 {
		return strings.TrimSpace(string(runes[:16]))
	}
	return text
}
