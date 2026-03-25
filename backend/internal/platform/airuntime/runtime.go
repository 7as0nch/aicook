package airuntime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

type Mode string

const (
	ModeADK   Mode = "adk"
	ModeGraph Mode = "graph"
)

type Attachment struct {
	Type        string `json:"type"`
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
	Name        string `json:"name"`
}

type QuoteContext struct {
	SelectedText    string `json:"selected_text"`
	SelectionSource string `json:"selection_source"`
	SurroundingText string `json:"surrounding_text"`
	Scene           string `json:"scene"`
}

type Source struct {
	Title      string `json:"title"`
	DocumentID string `json:"document_id"`
	Snippet    string `json:"snippet"`
}

type ReplyRequest struct {
	Scene        string       `json:"scene"`
	Text         string       `json:"text"`
	Attachments  []Attachment `json:"attachments"`
	QuoteContext QuoteContext `json:"quote_context"`
	Sources      []Source     `json:"sources"`
}

type ReplyResponse struct {
	Mode    Mode     `json:"mode"`
	Content string   `json:"content"`
	Sources []Source `json:"sources"`
}

type DraftIngredient struct {
	GroupName   string `json:"group_name"`
	Name        string `json:"name"`
	AmountText  string `json:"amount_text"`
	Preparation string `json:"preparation"`
}

type DraftStep struct {
	Title          string `json:"title"`
	Description    string `json:"description"`
	StepType       string `json:"step_type"`
	NeedTimer      bool   `json:"need_timer"`
	TimerSeconds   int    `json:"timer_seconds"`
	TimerAnimation string `json:"timer_animation"`
	EndCondition   string `json:"end_condition"`
}

type ImageRecipeDraftInput struct {
	TitleHint string       `json:"title_hint"`
	OCRText   string       `json:"ocr_text"`
	Images    []Attachment `json:"images"`
}

type ImageRecipeDraft struct {
	Title        string            `json:"title"`
	Summary      string            `json:"summary"`
	Category     string            `json:"category"`
	TotalMinutes int               `json:"total_minutes"`
	Difficulty   int               `json:"difficulty"`
	Tools        []string          `json:"tools"`
	Ingredients  []DraftIngredient `json:"ingredients"`
	Steps        []DraftStep       `json:"steps"`
}

type Runtime struct {
	mode       Mode
	provider   *conf.AI
	httpClient *http.Client
}

func New(cfg *conf.AI) *Runtime {
	mode := Mode(strings.ToLower(strings.TrimSpace(cfg.GetMode())))
	if mode != ModeGraph {
		mode = ModeADK
	}

	return &Runtime{
		mode:     mode,
		provider: cfg,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

func (r *Runtime) Mode() Mode {
	return r.mode
}

func (r *Runtime) Reply(ctx context.Context, req ReplyRequest) (*ReplyResponse, error) {
	if r.provider.GetBaseUrl() != "" && r.provider.GetApiKey() != "" && r.provider.GetChatModel() != "" {
		content, err := r.callChatCompletion(ctx, buildReplyPrompt(r.mode, req), r.provider.GetChatModel())
		if err == nil && strings.TrimSpace(content) != "" {
			return &ReplyResponse{
				Mode:    r.mode,
				Content: strings.TrimSpace(content),
				Sources: req.Sources,
			}, nil
		}
	}

	return &ReplyResponse{
		Mode:    r.mode,
		Content: fallbackReply(req),
		Sources: req.Sources,
	}, nil
}

func (r *Runtime) GenerateImageRecipeDraft(ctx context.Context, input ImageRecipeDraftInput) (*ImageRecipeDraft, error) {
	if r.provider.GetBaseUrl() != "" && r.provider.GetApiKey() != "" && r.provider.GetChatModel() != "" {
		content, err := r.callChatCompletion(ctx, buildImageDraftPrompt(r.mode, input), r.provider.GetChatModel())
		if err == nil {
			if draft, parseErr := parseDraftJSON(content); parseErr == nil {
				return draft, nil
			}
		}
	}
	return heuristicDraft(input), nil
}

func (r *Runtime) callChatCompletion(ctx context.Context, prompt, model string) (string, error) {
	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type request struct {
		Model       string    `json:"model"`
		Temperature float64   `json:"temperature"`
		Messages    []message `json:"messages"`
	}
	type response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	payload, err := json.Marshal(request{
		Model:       model,
		Temperature: 0.2,
		Messages: []message{
			{Role: "system", Content: "你是 AICook 的智能烹饪助手，请使用简洁、结构化、可执行的中文回答。"},
			{Role: "user", Content: prompt},
		},
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(r.provider.GetBaseUrl(), "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+r.provider.GetApiKey())
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("chat completion status: %s", resp.Status)
	}

	var out response
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("empty completion choices")
	}
	return out.Choices[0].Message.Content, nil
}

func buildReplyPrompt(mode Mode, req ReplyRequest) string {
	builder := strings.Builder{}
	builder.WriteString("你是 AICook 的 AI 助手。\n")
	builder.WriteString("编排模式: " + string(mode) + "\n")
	builder.WriteString("当前场景: " + req.Scene + "\n")
	builder.WriteString("用户问题: " + req.Text + "\n")
	if req.QuoteContext.SelectedText != "" {
		builder.WriteString("引用内容:\n" + req.QuoteContext.SelectedText + "\n")
	}
	if req.QuoteContext.SurroundingText != "" {
		builder.WriteString("上下文:\n" + req.QuoteContext.SurroundingText + "\n")
	}
	if len(req.Sources) > 0 {
		builder.WriteString("可参考资料:\n")
		for _, source := range req.Sources {
			builder.WriteString("- [" + source.Title + "] " + source.Snippet + "\n")
		}
	}
	builder.WriteString("请输出简洁、直接、可执行的中文回答；必要时用 2 到 3 个步骤说明。")
	return builder.String()
}

func buildImageDraftPrompt(mode Mode, input ImageRecipeDraftInput) string {
	return fmt.Sprintf(`你是 AICook 的菜谱结构化助手，请根据 OCR 文本整理出菜谱草稿。
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
%s`, mode, input.TitleHint, input.OCRText)
}

func parseDraftJSON(raw string) (*ImageRecipeDraft, error) {
	body := strings.TrimSpace(raw)
	if !json.Valid([]byte(body)) {
		re := regexp.MustCompile(`(?s)\{.*\}`)
		body = re.FindString(body)
	}
	if !json.Valid([]byte(body)) {
		return nil, fmt.Errorf("draft response is not valid json")
	}

	var draft ImageRecipeDraft
	if err := json.Unmarshal([]byte(body), &draft); err != nil {
		return nil, err
	}
	if strings.TrimSpace(draft.Title) == "" {
		return nil, fmt.Errorf("draft title is empty")
	}
	return &draft, nil
}

func heuristicDraft(input ImageRecipeDraftInput) *ImageRecipeDraft {
	lines := splitMeaningfulLines(input.OCRText)
	title := strings.TrimSpace(input.TitleHint)
	if title == "" && len(lines) > 0 {
		title = lines[0]
	}
	if title == "" {
		title = "图片识别菜谱草稿"
	}

	ingredients := make([]DraftIngredient, 0)
	steps := make([]DraftStep, 0)
	for _, line := range lines {
		switch {
		case looksLikeIngredient(line):
			ingredients = append(ingredients, DraftIngredient{
				GroupName:  "食材",
				Name:       normalizeIngredientName(line),
				AmountText: normalizeAmount(line),
			})
		case looksLikeStep(line):
			timerSeconds := extractTimer(line)
			steps = append(steps, DraftStep{
				Title:          fmt.Sprintf("步骤 %d", len(steps)+1),
				Description:    line,
				StepType:       "cook",
				NeedTimer:      timerSeconds > 0,
				TimerSeconds:   timerSeconds,
				TimerAnimation: "ring",
				EndCondition:   extractEndCondition(line),
			})
		}
	}

	if len(steps) == 0 {
		for idx, line := range lines {
			timerSeconds := extractTimer(line)
			steps = append(steps, DraftStep{
				Title:          fmt.Sprintf("步骤 %d", idx+1),
				Description:    line,
				StepType:       "cook",
				NeedTimer:      timerSeconds > 0,
				TimerSeconds:   timerSeconds,
				TimerAnimation: "ring",
				EndCondition:   extractEndCondition(line),
			})
		}
	}

	return &ImageRecipeDraft{
		Title:        title,
		Summary:      "基于教程图片与 OCR 文本生成的菜谱草稿，建议发布前人工确认。",
		Category:     "家常菜",
		TotalMinutes: estimateMinutes(lines),
		Difficulty:   2,
		Tools:        []string{"锅具"},
		Ingredients:  ingredients,
		Steps:        steps,
	}
}

func fallbackReply(req ReplyRequest) string {
	if req.QuoteContext.SelectedText != "" {
		return fmt.Sprintf("我先根据你选中的内容做个快速判断：%s。你可以继续追问做法细节、替代食材或者时间控制。", trimForPreview(req.QuoteContext.SelectedText))
	}
	if len(req.Sources) > 0 {
		return fmt.Sprintf("我结合当前知识片段做了初步理解：%s。你可以继续追问关键步骤、风险点或适合的人群。", trimForPreview(req.Sources[0].Snippet))
	}
	return "我已经接住你的问题了。当前会优先按 AICook 的 ADK/Graph 模式给出可执行建议；如果你愿意，也可以继续补充菜谱、食材或截图上下文。"
}

func splitMeaningfulLines(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '\n' || r == '\r'
	})
	lines := make([]string, 0, len(fields))
	for _, field := range fields {
		line := strings.TrimSpace(field)
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func looksLikeIngredient(line string) bool {
	lower := strings.ToLower(line)
	return strings.Contains(lower, "g") ||
		strings.Contains(lower, "ml") ||
		strings.Contains(line, "克") ||
		strings.Contains(line, "勺") ||
		strings.Contains(line, "少许") ||
		strings.Contains(line, "适量")
}

func looksLikeStep(line string) bool {
	for _, keyword := range []string{"倒入", "加入", "翻炒", "焖", "煮", "炸", "蒸", "烤"} {
		if strings.Contains(line, keyword) {
			return true
		}
	}
	return false
}

func normalizeIngredientName(line string) string {
	re := regexp.MustCompile(`[\d\.\-~至到约+\s]*(克|g|G|毫升|ml|ML|勺|汤匙|茶匙|个|片|少许|适量)?`)
	name := strings.TrimSpace(re.ReplaceAllString(line, ""))
	if name == "" {
		return strings.TrimSpace(line)
	}
	return name
}

func normalizeAmount(line string) string {
	re := regexp.MustCompile(`[\d\.\-~至到约+\s]*(克|g|G|毫升|ml|ML|勺|汤匙|茶匙|个|片|少许|适量)?`)
	matches := re.FindAllString(line, -1)
	parts := make([]string, 0, len(matches))
	for _, match := range matches {
		match = strings.TrimSpace(match)
		if match != "" {
			parts = append(parts, match)
		}
	}
	return strings.Join(parts, " ")
}

func extractTimer(line string) int {
	re := regexp.MustCompile(`(\d+)\s*(分钟|分)`)
	matches := re.FindStringSubmatch(line)
	if len(matches) < 2 {
		return 0
	}
	var minutes int
	fmt.Sscanf(matches[1], "%d", &minutes)
	return minutes * 60
}

func extractEndCondition(line string) string {
	for _, keyword := range []string{"金黄", "收汁", "软烂", "断生", "冒泡", "浓稠"} {
		if strings.Contains(line, keyword) {
			return keyword
		}
	}
	return ""
}

func estimateMinutes(lines []string) int {
	total := 0
	for _, line := range lines {
		total += extractTimer(line) / 60
	}
	if total > 0 {
		return total
	}
	switch {
	case len(lines) >= 10:
		return 35
	case len(lines) >= 6:
		return 25
	default:
		return 15
	}
}

func trimForPreview(raw string) string {
	runes := []rune(strings.TrimSpace(raw))
	if len(runes) <= 48 {
		return string(runes)
	}
	return string(runes[:48]) + "..."
}
