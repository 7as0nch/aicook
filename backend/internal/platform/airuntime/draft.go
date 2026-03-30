package airuntime

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	einomodel "github.com/cloudwego/eino/components/model"
	einoopenai "github.com/cloudwego/eino-ext/components/model/openai"
)

func (r *Runtime) GenerateImageRecipeDraft(ctx context.Context, input ImageRecipeDraftInput) (*ImageRecipeDraft, string, error) {
	var multimodalErr error
	if len(input.Images) > 0 && r.multimodalModel != nil {
		draft, err := r.generateImageDraftWithModel(ctx, r.multimodalModel, input)
		if err == nil {
			return draft, "multimodal", nil
		}
		multimodalErr = err
	}

	if strings.TrimSpace(input.OCRText) != "" {
		model := r.textModel
		if model == nil {
			model = r.multimodalModel
		}
		if model != nil {
			draft, err := r.generateImageDraftWithModel(ctx, model, input)
			if err == nil {
				return draft, "ocr_fallback", nil
			}
		}
		return heuristicDraft(input), "heuristic", nil
	}

	if multimodalErr != nil {
		return nil, "", multimodalErr
	}
	return heuristicDraft(input), "heuristic", nil
}

func (r *Runtime) generateImageDraftWithModel(ctx context.Context, model *einoopenai.ChatModel, input ImageRecipeDraftInput) (*ImageRecipeDraft, error) {
	if model == nil {
		return nil, fmt.Errorf("image draft model is not configured")
	}
	msg, err := r.generateMessage(ctx, model, buildImageDraftMessages(r.mode, input), einomodel.WithTemperature(0.2))
	if err != nil {
		return nil, err
	}
	if msg == nil {
		return nil, fmt.Errorf("image draft response is empty")
	}
	return parseDraftJSON(msg.Content)
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
