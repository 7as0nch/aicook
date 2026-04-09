package recipe

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

type Source struct {
	Title   string
	Snippet string
}

type DraftIngredient struct {
	GroupName   string
	Name        string
	AmountText  string
	Preparation string
}

type DraftStep struct {
	Title          string
	Description    string
	StepType       string
	NeedTimer      bool
	TimerSeconds   int
	TimerAnimation string
	EndCondition   string
}

type ImageDraftInput struct {
	TitleHint string
	OCRText   string
}

type ImageDraft struct {
	Title        string
	Summary      string
	Category     string
	TotalMinutes int
	Difficulty   int
	Tools        []string
	Ingredients  []DraftIngredient
	Steps        []DraftStep
}

type TextPreferences struct {
	Flavor     string
	Duration   string
	Difficulty string
	Style      string
	Constraints []string
}

type TextDraft struct {
	Title         string
	Summary       string
	Category      string
	CoverImageURL string
	TotalMinutes  int
	Difficulty    int
	Tools         []string
	ScenarioTags  []string
	FlavorTags    []string
	Ingredients   []DraftIngredient
	Steps         []DraftStep
}

func ParseImageDraftJSON(raw string) (*ImageDraft, error) {
	body := strings.TrimSpace(raw)
	if !json.Valid([]byte(body)) {
		re := regexp.MustCompile(`(?s)\{.*\}`)
		body = re.FindString(body)
	}
	if !json.Valid([]byte(body)) {
		return nil, fmt.Errorf("draft response is not valid json")
	}

	var draft ImageDraft
	if err := json.Unmarshal([]byte(body), &draft); err != nil {
		return nil, err
	}
	if strings.TrimSpace(draft.Title) == "" {
		return nil, fmt.Errorf("draft title is empty")
	}
	return &draft, nil
}

func HeuristicImageDraft(input ImageDraftInput) *ImageDraft {
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

	return &ImageDraft{
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

func ParseTextDraftJSON(raw string) (*TextDraft, error) {
	body := strings.TrimSpace(raw)
	if !json.Valid([]byte(body)) {
		re := regexp.MustCompile(`(?s)\{.*\}`)
		body = re.FindString(body)
	}
	if !json.Valid([]byte(body)) {
		return nil, fmt.Errorf("text recipe draft response is not valid json")
	}
	var draft TextDraft
	if err := json.Unmarshal([]byte(body), &draft); err != nil {
		return nil, err
	}
	return &draft, nil
}

func NormalizeTextDraft(query string, draft *TextDraft, preferences TextPreferences, seedCoverImageURL string) (*TextDraft, error) {
	if draft == nil {
		return nil, fmt.Errorf("text recipe draft is empty")
	}
	normalized := *draft
	normalized.Title = strings.TrimSpace(normalized.Title)
	if normalized.Title == "" {
		normalized.Title = strings.TrimSpace(query)
	}
	if normalized.Title == "" {
		return nil, fmt.Errorf("recipe title is empty")
	}
	normalized.Summary = strings.TrimSpace(normalized.Summary)
	if normalized.Summary == "" {
		normalized.Summary = fmt.Sprintf("%s的家常做法，已整理成可直接执行的步骤。", normalized.Title)
	}
	normalized.Category = strings.TrimSpace(normalized.Category)
	if normalized.Category == "" {
		normalized.Category = "家常菜"
	}
	normalized.CoverImageURL = strings.TrimSpace(normalized.CoverImageURL)
	if normalized.CoverImageURL == "" {
		normalized.CoverImageURL = strings.TrimSpace(seedCoverImageURL)
	}
	if normalized.Difficulty <= 0 {
		normalized.Difficulty = mapPreferenceDifficulty(preferences.Difficulty)
	}
	if normalized.Difficulty > 5 {
		normalized.Difficulty = 5
	}
	normalized.Tools = uniqueTrimmedStrings(normalized.Tools)
	normalized.ScenarioTags = uniqueTrimmedStrings(normalized.ScenarioTags)
	normalized.FlavorTags = uniqueTrimmedStrings(normalized.FlavorTags)
	if flavor := strings.TrimSpace(preferences.Flavor); flavor != "" && !containsString(normalized.FlavorTags, flavor) {
		normalized.FlavorTags = append([]string{flavor}, normalized.FlavorTags...)
	}
	if style := strings.TrimSpace(preferences.Style); style != "" && !containsString(normalized.ScenarioTags, style) {
		normalized.ScenarioTags = append([]string{style}, normalized.ScenarioTags...)
	}
	for _, constraint := range uniqueTrimmedStrings(preferences.Constraints) {
		if !containsString(normalized.ScenarioTags, constraint) {
			normalized.ScenarioTags = append(normalized.ScenarioTags, constraint)
		}
	}

	ingredients := make([]DraftIngredient, 0, len(normalized.Ingredients))
	for _, item := range normalized.Ingredients {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		ingredients = append(ingredients, DraftIngredient{
			GroupName:   strings.TrimSpace(item.GroupName),
			Name:        name,
			AmountText:  strings.TrimSpace(item.AmountText),
			Preparation: strings.TrimSpace(item.Preparation),
		})
	}
	if len(ingredients) == 0 {
		return nil, fmt.Errorf("recipe ingredients are empty")
	}
	normalized.Ingredients = ingredients

	steps := make([]DraftStep, 0, len(normalized.Steps))
	totalSeconds := 0
	for idx, item := range normalized.Steps {
		description := strings.TrimSpace(item.Description)
		if description == "" {
			continue
		}
		timerSeconds := item.TimerSeconds
		if timerSeconds <= 0 {
			timerSeconds = extractTimer(description)
		}
		needTimer := item.NeedTimer || timerSeconds > 0
		if needTimer && timerSeconds <= 0 {
			timerSeconds = 300
		}
		if timerSeconds > 0 {
			totalSeconds += timerSeconds
		}
		steps = append(steps, DraftStep{
			Title:          fallbackStepTitle(strings.TrimSpace(item.Title), idx+1),
			Description:    description,
			StepType:       fallbackStepType(strings.TrimSpace(item.StepType)),
			NeedTimer:      needTimer,
			TimerSeconds:   timerSeconds,
			TimerAnimation: fallbackTimerAnimation(strings.TrimSpace(item.TimerAnimation), needTimer),
			EndCondition:   strings.TrimSpace(item.EndCondition),
		})
	}
	if len(steps) == 0 {
		return nil, fmt.Errorf("recipe steps are empty")
	}
	normalized.Steps = steps

	if normalized.TotalMinutes <= 0 {
		if totalSeconds > 0 {
			normalized.TotalMinutes = maxInt(10, totalSeconds/60)
		} else {
			normalized.TotalMinutes = maxInt(15, len(steps)*5)
		}
	}
	normalized.TotalMinutes = applyDurationPreference(normalized.TotalMinutes, preferences.Duration)
	return &normalized, nil
}

func BuildTextDraftPrompt(query string, sources []Source, preferences TextPreferences) string {
	sourceLines := make([]string, 0, len(sources))
	for _, item := range sources {
		line := strings.TrimSpace(item.Title)
		if snippet := strings.TrimSpace(item.Snippet); snippet != "" {
			if line != "" {
				line += "："
			}
			line += snippet
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
	if constraints := uniqueTrimmedStrings(preferences.Constraints); len(constraints) > 0 {
		preferenceLines = append(preferenceLines, fmt.Sprintf("- 额外要求：%s", strings.Join(constraints, "；")))
	}

	return fmt.Sprintf(`你是 AICook 的中文菜谱结构化助手。请围绕“%s”输出一个适合家庭烹饪的完整菜谱 JSON，不要输出解释性文字。

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
}

func splitMeaningfulLines(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool { return r == '\n' || r == '\r' })
	lines := make([]string, 0, len(fields))
	for _, field := range fields {
		line := strings.TrimSpace(field)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func looksLikeIngredient(line string) bool {
	lower := strings.ToLower(line)
	return strings.Contains(lower, "g") || strings.Contains(lower, "ml") || strings.Contains(line, "克") || strings.Contains(line, "勺") || strings.Contains(line, "少许") || strings.Contains(line, "适量")
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

func fallbackStepTitle(title string, idx int) string {
	if title != "" {
		return title
	}
	return fmt.Sprintf("步骤 %d", idx)
}

func fallbackStepType(stepType string) string {
	if stepType == "" {
		return "cook"
	}
	return stepType
}

func fallbackTimerAnimation(animation string, needTimer bool) string {
	if !needTimer {
		return ""
	}
	if animation == "" {
		return "ring"
	}
	return animation
}

func uniqueTrimmedStrings(items []string) []string {
	result := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func mapPreferenceDifficulty(value string) int {
	switch strings.TrimSpace(value) {
	case "简单":
		return 1
	case "中等":
		return 2
	case "进阶":
		return 4
	default:
		return 2
	}
}

func applyDurationPreference(minutes int, preference string) int {
	switch strings.TrimSpace(preference) {
	case "20 分钟内":
		if minutes <= 0 || minutes > 20 {
			return 20
		}
	case "40 分钟内":
		if minutes <= 0 || minutes > 40 {
			return 40
		}
	case "1 小时左右":
		if minutes <= 0 || minutes > 60 {
			return 60
		}
	}
	return minutes
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if strings.TrimSpace(item) == target {
			return true
		}
	}
	return false
}

func fallbackPreferenceText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
