package airuntime

import (
	"fmt"
	"strings"

	"github.com/cloudwego/eino/schema"
)

func buildConversationMessages(req ReplyRequest) []*schema.Message {
	messages := make([]*schema.Message, 0, len(req.History)+1)
	for _, item := range req.History {
		content := strings.TrimSpace(item.Content)
		if content == "" {
			continue
		}
		role := schema.User
		if strings.EqualFold(item.Role, "assistant") {
			role = schema.Assistant
		}
		messages = append(messages, &schema.Message{
			Role:    role,
			Content: content,
		})
	}
	messages = append(messages, buildCurrentUserMessage(req))
	return messages
}

func buildCurrentUserMessage(req ReplyRequest) *schema.Message {
	prompt := buildReplyPrompt(req)
	if len(req.Attachments) == 0 {
		return &schema.Message{
			Role:    schema.User,
			Content: prompt,
		}
	}

	parts := []schema.MessageInputPart{
		{
			Type: schema.ChatMessagePartTypeText,
			Text: prompt,
		},
	}
	for _, attachment := range req.Attachments {
		if strings.TrimSpace(attachment.URL) == "" {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(attachment.Type)) {
		case "image":
			url := attachment.URL
			parts = append(parts, schema.MessageInputPart{
				Type: schema.ChatMessagePartTypeImageURL,
				Image: &schema.MessageInputImage{
					MessagePartCommon: schema.MessagePartCommon{URL: &url, MIMEType: attachment.ContentType},
				},
			})
		case "audio":
			url := attachment.URL
			parts = append(parts, schema.MessageInputPart{
				Type: schema.ChatMessagePartTypeAudioURL,
				Audio: &schema.MessageInputAudio{
					MessagePartCommon: schema.MessagePartCommon{URL: &url, MIMEType: attachment.ContentType},
				},
			})
		default:
			url := attachment.URL
			parts = append(parts, schema.MessageInputPart{
				Type: schema.ChatMessagePartTypeFileURL,
				File: &schema.MessageInputFile{
					MessagePartCommon: schema.MessagePartCommon{URL: &url, MIMEType: attachment.ContentType},
					Name:              attachment.Name,
				},
			})
		}
	}

	return &schema.Message{
		Role:                  schema.User,
		UserInputMultiContent: parts,
	}
}

func buildReplyPrompt(req ReplyRequest) string {
	builder := strings.Builder{}
	builder.WriteString("你是 AICook 的 AI 助手。\n")
	builder.WriteString("编排模式: " + string(ModeADK) + "\n")
	builder.WriteString("当前场景: " + req.Scene + "\n")
	if req.Text != "" {
		builder.WriteString("用户问题: " + req.Text + "\n")
	}
	if req.QuoteContext.SelectedText != "" {
		builder.WriteString("引用内容:\n" + req.QuoteContext.SelectedText + "\n")
	}
	if req.QuoteContext.SurroundingText != "" {
		builder.WriteString("上下文:\n" + req.QuoteContext.SurroundingText + "\n")
	}
	if len(req.Sources) > 0 {
		builder.WriteString("可参考资料:\n")
		for _, source := range req.Sources {
			builder.WriteString(fmt.Sprintf("- [%s] %s\n", source.Title, source.Snippet))
		}
	}
	builder.WriteString("请输出简洁、直接、可执行的中文回答；必要时用 2 到 3 个步骤说明。")
	return builder.String()
}

func buildImageDraftMessages(mode Mode, input ImageRecipeDraftInput) []*schema.Message {
	prompt := buildImageDraftPrompt(mode, input)
	if len(input.Images) == 0 {
		return []*schema.Message{
			{
				Role:    schema.System,
				Content: "你是 AICook 的菜谱结构化助手，只输出合法 JSON，不要补充解释。",
			},
			{
				Role:    schema.User,
				Content: prompt,
			},
		}
	}

	parts := []schema.MessageInputPart{
		{
			Type: schema.ChatMessagePartTypeText,
			Text: prompt,
		},
	}
	for _, attachment := range input.Images {
		if strings.TrimSpace(attachment.URL) == "" {
			continue
		}
		url := attachment.URL
		parts = append(parts, schema.MessageInputPart{
			Type: schema.ChatMessagePartTypeImageURL,
			Image: &schema.MessageInputImage{
				MessagePartCommon: schema.MessagePartCommon{
					URL:      &url,
					MIMEType: attachment.ContentType,
				},
			},
		})
	}
	return []*schema.Message{
		{
			Role:    schema.System,
			Content: "你是 AICook 的菜谱结构化助手，只输出合法 JSON，不要补充解释。",
		},
		{
			Role:                  schema.User,
			UserInputMultiContent: parts,
		},
	}
}

func buildImageDraftPrompt(mode Mode, input ImageRecipeDraftInput) string {
	ocrText := strings.TrimSpace(input.OCRText)
	if ocrText == "" {
		ocrText = "无 OCR 文本，请直接根据图片理解内容。"
	}
	return fmt.Sprintf(`你是 AICook 的菜谱结构化助手，请优先根据图片内容理解菜谱；如果有 OCR 文本，只把它当作辅助线索。
当前编排模式: %s
标题提示: %s

请仅输出 JSON，结构如下：
{
  "title": "",
  "summary": "",
  "category": "",
  "total_minutes": 0,
  "difficulty": 1,
  "tools": [],
  "ingredients": [{"group_name":"","name":"","amount_text":"","preparation":""}],
  "steps": [{"title":"","description":"","step_type":"cook","need_timer":false,"timer_seconds":0,"timer_animation":"ring","end_condition":""}]
}

OCR 文本：
%s`, mode, input.TitleHint, ocrText)
}
