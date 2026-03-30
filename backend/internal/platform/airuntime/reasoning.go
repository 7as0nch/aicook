package airuntime

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/cloudwego/eino/schema"
)

type openAIReasoningEnvelope struct {
	Choices []struct {
		Message *struct {
			ReasoningContent any `json:"reasoning_content"`
			Reasoning        any `json:"reasoning"`
		} `json:"message"`
		Delta *struct {
			ReasoningContent any `json:"reasoning_content"`
			Reasoning        any `json:"reasoning"`
		} `json:"delta"`
	} `json:"choices"`
}

func reasoningResponseModifier(_ context.Context, msg *schema.Message, rawBody []byte) (*schema.Message, error) {
	return applyReasoningCompatibility(msg, rawBody, false), nil
}

func reasoningChunkModifier(_ context.Context, msg *schema.Message, rawBody []byte, end bool) (*schema.Message, error) {
	if end {
		return msg, nil
	}
	return applyReasoningCompatibility(msg, rawBody, true), nil
}

func applyReasoningCompatibility(msg *schema.Message, rawBody []byte, stream bool) *schema.Message {
	if msg == nil {
		return nil
	}
	if normalized := normalizeReasoningContent(msg.ReasoningContent); normalized != "" {
		msg.ReasoningContent = normalized
		return msg
	}
	if len(rawBody) == 0 {
		return msg
	}
	if extracted := extractReasoningContent(rawBody, stream); extracted != "" {
		msg.ReasoningContent = extracted
	}
	return msg
}

func extractReasoningContent(rawBody []byte, stream bool) string {
	var payload openAIReasoningEnvelope
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return ""
	}
	for _, choice := range payload.Choices {
		if stream && choice.Delta != nil {
			if text := firstReasoningText(choice.Delta.ReasoningContent, choice.Delta.Reasoning); text != "" {
				return text
			}
		}
		if choice.Message != nil {
			if text := firstReasoningText(choice.Message.ReasoningContent, choice.Message.Reasoning); text != "" {
				return text
			}
		}
		if choice.Delta != nil {
			if text := firstReasoningText(choice.Delta.ReasoningContent, choice.Delta.Reasoning); text != "" {
				return text
			}
		}
	}
	return ""
}

func firstReasoningText(values ...any) string {
	for _, value := range values {
		if text := normalizeReasoningValue(value); text != "" {
			return text
		}
	}
	return ""
}

func normalizeReasoningValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return normalizeReasoningContent(v)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			if text := normalizeReasoningValue(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.TrimSpace(strings.Join(parts, "\n"))
	case map[string]any:
		for _, key := range []string{"text", "content", "reasoning_content", "reasoning"} {
			if text := normalizeReasoningValue(v[key]); text != "" {
				return text
			}
		}
	}
	return ""
}

func normalizeReasoningContent(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	var unquoted string
	if err := json.Unmarshal([]byte(text), &unquoted); err == nil {
		return strings.TrimSpace(unquoted)
	}
	return text
}
