package airuntime

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/schema"
)

func (r *Runtime) buildConversationMessages(ctx context.Context, req ReplyRequest) ([]*schema.Message, error) {
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
	current, err := r.buildCurrentUserMessage(ctx, req)
	if err != nil {
		return nil, err
	}
	messages = append(messages, current)
	stripUnsupportedFileURLParts(messages)
	return messages, nil
}

// OpenAI-compatible chat models in eino-ext reject file_url parts; some ADK/tool paths may still emit them.
// Convert those parts to plain text so PDF/metadata turns from user prompts do not crash the model node.
func stripUnsupportedFileURLParts(messages []*schema.Message) {
	for _, m := range messages {
		if m == nil || len(m.UserInputMultiContent) == 0 {
			continue
		}
		next := make([]schema.MessageInputPart, 0, len(m.UserInputMultiContent))
		for _, part := range m.UserInputMultiContent {
			if part.Type != schema.ChatMessagePartTypeFileURL {
				next = append(next, part)
				continue
			}
			var b strings.Builder
			b.WriteString("[附件：模型接口不支持 file_url，已改为文本描述]")
			if part.File != nil {
				if part.File.Name != "" {
					b.WriteString(" 文件: ")
					b.WriteString(part.File.Name)
				}
				if part.File.URL != nil && strings.TrimSpace(*part.File.URL) != "" {
					b.WriteString(" URL: ")
					b.WriteString(strings.TrimSpace(*part.File.URL))
				}
				if strings.TrimSpace(part.File.MIMEType) != "" {
					b.WriteString(" 类型: ")
					b.WriteString(strings.TrimSpace(part.File.MIMEType))
				}
			}
			next = append(next, schema.MessageInputPart{
				Type: schema.ChatMessagePartTypeText,
				Text: b.String(),
			})
		}
		m.UserInputMultiContent = next
	}
}

func (r *Runtime) buildCurrentUserMessage(ctx context.Context, req ReplyRequest) (*schema.Message, error) {
	basePrompt := buildReplyPrompt(req)
	if len(req.Attachments) == 0 {
		return &schema.Message{
			Role:    schema.User,
			Content: basePrompt,
		}, nil
	}

	var docNotes strings.Builder
	mediaParts := make([]schema.MessageInputPart, 0, len(req.Attachments))

	for _, attachment := range req.Attachments {
		if strings.TrimSpace(attachment.URL) == "" {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(attachment.Type)) {
		case "image":
			// base64 内联，不把内网 http MinIO URL 交给 MiMo 云端拉取（否则 400 Param Incorrect）
			ip, err := r.buildImageInputPart(ctx, attachment)
			if err != nil {
				return nil, err
			}
			mediaParts = append(mediaParts, ip)
		case "audio":
			ap, err := r.buildAudioInputPart(ctx, attachment)
			if err != nil {
				return nil, err
			}
			mediaParts = append(mediaParts, ap)
		default:
			// document / file：多数 OpenAI 兼容接口不支持 file_url，改为文本描述，避免 ChatModel 报错。
			name := strings.TrimSpace(attachment.Name)
			if name == "" {
				name = "未命名"
			}
			ct := strings.TrimSpace(attachment.ContentType)
			if ct == "" {
				ct = "application/octet-stream"
			}
			assetID := strings.TrimSpace(attachment.AssetID)
			if assetID != "" {
				docNotes.WriteString(fmt.Sprintf("\n[用户上传文件: %s | 类型: %s | URL: %s | asset_id: %s]\n", name, ct, attachment.URL, assetID))
			} else {
				docNotes.WriteString(fmt.Sprintf("\n[用户上传文件: %s | 类型: %s | URL: %s]\n", name, ct, attachment.URL))
			}
		}
	}

	fullText := basePrompt
	if docNotes.Len() > 0 {
		// Aligns with biz: document attachments trigger IngestMediaAssetAsDocument → 「厨艺AI资料库」
		fullText = basePrompt + docNotes.String() + `
【系统说明·文档附件】上述 PDF/文档类附件已由服务端自动入库到家庭知识库「厨艺AI资料库」（切块、向量与知识图谱在后台异步处理）。若用户表达「保存/存储/帮我记下这份资料」等意图，请直接确认已开始入库，并说明稍后可提问或让用户说出菜名/食材，你会通过知识库检索帮他查；不要臆测内部规则、不要要求用户必须再去 App「家庭知识库」页重新上传同一份文件。若用户追问这份文件是否成功、当前进度如何、或者要求直接重试，优先调用工具 knowledge_ingest_manage。不要为 PDF/文档调用图片菜谱识别的多模态子 agent。若用户要立即引用正文而索引尚未完成，可如实说明需等待片刻后再试 knowledge_lookup。`
	}

	parts := []schema.MessageInputPart{
		{Type: schema.ChatMessagePartTypeText, Text: fullText},
	}
	parts = append(parts, mediaParts...)

	return &schema.Message{
		Role:                  schema.User,
		UserInputMultiContent: parts,
	}, nil
}

func sourceKindPromptTag(kind string) string {
	switch kind {
	case SourceKindMemory:
		return "长期记忆"
	case SourceKindKnowledgeBase:
		return "家庭知识库"
	case SourceKindKnowledgeGraph:
		return "知识图谱"
	default:
		return ""
	}
}

func buildReplyPrompt(req ReplyRequest) string {
	builder := strings.Builder{}
	builder.WriteString("你是 AICook 的 AI 助手。\n")
	builder.WriteString("编排模式: " + string(ModeADK) + "\n")
	builder.WriteString("当前场景: " + req.Scene + "\n")
	if isRecipeGenerationIntent(req) {
		builder.WriteString("本轮目标: 为用户生成或确认一版可执行的新菜谱。\n")
		builder.WriteString("执行要求: 不要先输出普通网页搜索摘要；优先进入推荐/生成链路，再基于检索结果整理成菜谱。\n")
	}
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
			tag := sourceKindPromptTag(source.SourceKind)
			if tag != "" {
				builder.WriteString(fmt.Sprintf("- 【%s】%s: %s\n", tag, source.Title, source.Snippet))
			} else {
				builder.WriteString(fmt.Sprintf("- [%s] %s\n", source.Title, source.Snippet))
			}
		}
	}
	if len(req.ActiveCooking) > 0 {
		builder.WriteString("用户当前有未完成的做菜进度（可在 App 中打开对应做菜页继续，路径示例）：\n")
		for _, c := range req.ActiveCooking {
			step := fmt.Sprintf("第 %d/%d 步", c.StepIndex+1, c.TotalSteps)
			if c.RemainingSeconds > 0 {
				builder.WriteString(fmt.Sprintf("- 《%s》%s，倒计时剩余约 %d 秒，路径 %s\n", c.Title, step, c.RemainingSeconds, c.CookPath))
			} else {
				builder.WriteString(fmt.Sprintf("- 《%s》%s，路径 %s\n", c.Title, step, c.CookPath))
			}
		}
		builder.WriteString("如用户想继续做菜，可提醒用户使用做菜页或首页「进行中」入口，无需编造链接。\n")
	}
	builder.WriteString("请输出简洁、直接、可执行的中文回答；必要时用 2 到 3 个步骤说明。")
	return builder.String()
}

// imageParts 由调用方预先解析为 base64 内联 part（见 Runtime.resolveImageDraftParts）；
// 这里不再直接用 input.Images 的 URL，避免把内网 http 存储地址交给 MiMo 云端拉取。
func buildImageDraftMessages(mode Mode, input ImageRecipeDraftInput, imageParts []schema.MessageInputPart) []*schema.Message {
	prompt := buildImageDraftPrompt(mode, input)
	if len(imageParts) == 0 {
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
	parts = append(parts, imageParts...)
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
