package airtool

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
)

type TextRecipeResult struct {
	Status  string      `json:"status"`
	Summary string      `json:"summary,omitempty"`
	Card    *RecipeCard `json:"card,omitempty"`
	Sources []Source    `json:"sources,omitempty"`
}

type textRecipeState struct {
	Query           string                   `json:"query"`
	Prompt          string                   `json:"prompt"`
	Options         []ApprovalOption         `json:"options"`
	Stage           string                   `json:"stage"`
	Preferences     TextRecipePreferences    `json:"preferences"`
	CoverImageURL   string                   `json:"cover_image_url,omitempty"`
	Questions       []RecipePreferenceQuestion `json:"questions,omitempty"`
	QuestionIndex   int                      `json:"question_index,omitempty"`
	SelectionMode   string                   `json:"selection_mode,omitempty"`
	SelectedOptionIDs []string               `json:"selected_option_ids,omitempty"`
}

func NewRecipeGenerateTool(
	searchExisting func(context.Context, string, int) ([]RecipeCard, error),
	generate func(context.Context, string, TextRecipePreferences, string) (*TextRecipeResult, error),
	planPreferences func(context.Context, string, TextRecipePreferences) (*RecipePreferencePlan, error),
	alreadyGenerated func(context.Context) bool,
) (einotool.BaseTool, error) {
	return toolutils.InferTool("recipe_generate", "为用户生成可确认保存的新菜谱；若已有近似菜谱则先让用户确认。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("recipe generate query is empty")
		}

		wasInterrupted, hasState, state := einotool.GetInterruptState[*textRecipeState](ctx)
		if !wasInterrupted {
			// 确定性护栏：本轮已经产出过菜谱卡片时，禁止 planner 再次发起生成——
			// 否则新调用会重新规划偏好追问，造成"菜谱出来了又弹问题"的死循环。
			if alreadyGenerated != nil && alreadyGenerated(ctx) {
				return marshal(TextRecipeResult{
					Status:  "already_generated",
					Summary: "本轮已经生成过菜谱卡片，请引导用户查看或保存当前卡片；若用户提出新的调整需求，等用户在下一条消息明确说明后再生成。",
				})
			}
			limit := input.Limit
			if limit <= 0 {
				limit = 3
			}
			if searchExisting != nil {
				matches, err := searchExisting(ctx, query, limit)
				if err != nil {
					return "", err
				}
				if len(matches) > 0 {
					options := make([]ApprovalOption, 0, len(matches)+1)
					for idx, item := range matches {
						optionID := item.RecipeID
						if optionID == "" {
							optionID = fmt.Sprintf("existing_%d", idx+1)
						}
						card := item
						options = append(options, ApprovalOption{
							ID:         optionID,
							Title:      item.Title,
							Summary:    item.Summary,
							RecipeCard: &card,
						})
					}
					options = append(options, ApprovalOption{
						ID:      "__generate_new__",
						Title:   "都不是，帮我新生成一版",
						Summary: "继续结合知识库或联网结果生成新的完整菜谱。",
					})
					state := &textRecipeState{
						Query:         query,
						Prompt:        "我在你的家庭菜谱库里找到了相近菜谱，先确认是不是同一款。",
						Options:       options,
						Stage:         "existing_check",
						CoverImageURL: pickExistingCoverImage(matches),
					}
					return interruptTextRecipeStage(ctx, state)
				}
			}
			if generate == nil {
				return "", fmt.Errorf("recipe generate callback is nil")
			}
			return startDynamicPreferenceStage(ctx, query, TextRecipePreferences{}, "", planPreferences, generate)
		}

		if !hasState || state == nil {
			return "", fmt.Errorf("text recipe state is missing")
		}
		isTarget, hasData, data := einotool.GetResumeContext[*ApprovalResult](ctx)
		if !isTarget {
			return interruptTextRecipeStage(ctx, state)
		}
		if !hasData || data == nil || !data.Approved {
			return marshal(TextRecipeResult{
				Status:  "cancelled",
				Summary: "这次先不继续生成，你也可以重新换一道菜名试试。",
			})
		}

		switch state.Stage {
		case "existing_check":
			if data.OptionID != "__generate_new__" {
				for _, option := range state.Options {
					if option.ID != data.OptionID || option.RecipeCard == nil {
						continue
					}
					return marshal(TextRecipeResult{
						Status:  "existing_recipe",
						Summary: fmt.Sprintf("已确认使用现有菜谱「%s」。", option.Title),
						Card:    option.RecipeCard,
					})
				}
			}
			return startDynamicPreferenceStage(ctx, state.Query, state.Preferences, state.CoverImageURL, planPreferences, generate)
		case "dynamic_preferences":
			applyTextRecipeSelections(state, selectedOptionIDs(data))
			state.QuestionIndex++
			if state.QuestionIndex < len(state.Questions) {
				loadCurrentRecipeQuestion(state)
				return interruptTextRecipeStage(ctx, state)
			}
			if generate == nil {
				return "", fmt.Errorf("recipe generate callback is nil")
			}
			result, err := generate(ctx, state.Query, state.Preferences, state.CoverImageURL)
			if err != nil {
				return "", err
			}
			return marshal(result)
		}
		return "", fmt.Errorf("unsupported text recipe stage: %s", state.Stage)
	})
}

func interruptTextRecipeStage(ctx context.Context, state *textRecipeState) (string, error) {
	if state == nil {
		return "", fmt.Errorf("text recipe state is nil")
	}
	kind := "recipe_generate_preferences"
	if state.Stage == "existing_check" {
		kind = "recipe_generate_existing_check"
	}
	selectionMode := "single"
	stepIndex := 1
	stepTotal := 1
	selectedOptionIDs := append([]string(nil), state.SelectedOptionIDs...)
	if state.Stage == "dynamic_preferences" {
		selectionMode = currentRecipeQuestionSelectionMode(state)
		stepTotal = len(state.Questions)
		if stepTotal <= 0 {
			stepTotal = 1
		}
		stepIndex = state.QuestionIndex + 1
	}
	return "", einotool.StatefulInterrupt(ctx, &ApprovalInterrupt{
		Kind:              kind,
		Prompt:            state.Prompt,
		Options:           state.Options,
		SelectionMode:     selectionMode,
		StepIndex:         stepIndex,
		StepTotal:         stepTotal,
		SelectedOptionIDs: selectedOptionIDs,
	}, state)
}

func startDynamicPreferenceStage(
	ctx context.Context,
	query string,
	preferences TextRecipePreferences,
	coverImageURL string,
	planPreferences func(context.Context, string, TextRecipePreferences) (*RecipePreferencePlan, error),
	generate func(context.Context, string, TextRecipePreferences, string) (*TextRecipeResult, error),
) (string, error) {
	// 这里把“用户偏好追问”收敛成逐题 interrupt。
	// 如果模型判断当前信息已经足够，questions 会为空，直接进入生成阶段。
	if planPreferences == nil {
		if generate == nil {
			return "", fmt.Errorf("recipe generate callback is nil")
		}
		result, err := generate(ctx, query, preferences, coverImageURL)
		if err != nil {
			return "", err
		}
		return marshal(result)
	}
	plan, err := planPreferences(ctx, query, preferences)
	if err != nil {
		return "", err
	}
	questions := sanitizeRecipePreferenceQuestions(plan)
	if len(questions) == 0 {
		if generate == nil {
			return "", fmt.Errorf("recipe generate callback is nil")
		}
		result, err := generate(ctx, query, preferences, coverImageURL)
		if err != nil {
			return "", err
		}
		return marshal(result)
	}
	state := &textRecipeState{
		Query:           query,
		Stage:           "dynamic_preferences",
		Preferences:     preferences,
		CoverImageURL:   coverImageURL,
		Questions:       questions,
		QuestionIndex:   0,
	}
	loadCurrentRecipeQuestion(state)
	return interruptTextRecipeStage(ctx, state)
}

func loadCurrentRecipeQuestion(state *textRecipeState) {
	if state == nil {
		return
	}
	if state.QuestionIndex < 0 || state.QuestionIndex >= len(state.Questions) {
		state.Prompt = ""
		state.Options = nil
		state.SelectionMode = "single"
		state.SelectedOptionIDs = nil
		return
	}
	question := state.Questions[state.QuestionIndex]
	state.Prompt = strings.TrimSpace(question.Prompt)
	state.Options = append([]ApprovalOption(nil), question.Options...)
	state.SelectionMode = normalizeSelectionMode(question.SelectionMode)
	state.SelectedOptionIDs = nil
}

func applyTextRecipeSelections(state *textRecipeState, optionIDs []string) {
	if state == nil || state.QuestionIndex < 0 || state.QuestionIndex >= len(state.Questions) {
		return
	}
	// 多选题会把多个选项合并写回结构化偏好；除 flavor/duration/difficulty/style 外，
	// 其余值统一沉淀到 constraints，供后续生成 prompt 继续消费。
	selected := normalizeSelectedIDs(optionIDs, state.Options)
	state.SelectedOptionIDs = append([]string(nil), selected...)
	for _, optionID := range selected {
		option := findApprovalOptionByID(state.Options, optionID)
		if option == nil {
			continue
		}
		assignRecipePreferenceValue(&state.Preferences, option)
	}
}

func assignRecipePreferenceValue(preferences *TextRecipePreferences, option *ApprovalOption) {
	if preferences == nil || option == nil {
		return
	}
	value := strings.TrimSpace(option.Value)
	if value == "" {
		value = strings.TrimSpace(option.Title)
	}
	switch strings.TrimSpace(option.PreferenceKey) {
	case "flavor":
		preferences.Flavor = value
	case "duration":
		preferences.Duration = value
	case "difficulty":
		preferences.Difficulty = value
	case "style":
		preferences.Style = value
	default:
		if value != "" && !containsRecipePreferenceValue(preferences.Constraints, value) {
			preferences.Constraints = append(preferences.Constraints, value)
		}
	}
}

func sanitizeRecipePreferenceQuestions(plan *RecipePreferencePlan) []RecipePreferenceQuestion {
	if plan == nil || len(plan.Questions) == 0 {
		return nil
	}
	questions := make([]RecipePreferenceQuestion, 0, minInt(len(plan.Questions), 5))
	for index, item := range plan.Questions {
		if len(questions) >= 5 {
			break
		}
		prompt := strings.TrimSpace(item.Prompt)
		if prompt == "" {
			prompt = fmt.Sprintf("问题 %d", index+1)
		}
		options := make([]ApprovalOption, 0, minInt(len(item.Options), 4))
		seen := map[string]struct{}{}
		for optIndex, option := range item.Options {
			if len(options) >= 4 {
				break
			}
			title := strings.TrimSpace(option.Title)
			if title == "" {
				continue
			}
			optionID := strings.TrimSpace(option.ID)
			if optionID == "" {
				optionID = fmt.Sprintf("q%d_opt_%d", index+1, optIndex+1)
			}
			if _, ok := seen[optionID]; ok {
				continue
			}
			seen[optionID] = struct{}{}
			options = append(options, ApprovalOption{
				ID:            optionID,
				Title:         title,
				Summary:       strings.TrimSpace(option.Summary),
				PreferenceKey: strings.TrimSpace(option.PreferenceKey),
				Value:         strings.TrimSpace(option.Value),
			})
		}
		if len(options) == 0 {
			continue
		}
		questions = append(questions, RecipePreferenceQuestion{
			ID:            nonEmpty(item.ID, fmt.Sprintf("question_%d", index+1)),
			Prompt:        prompt,
			SelectionMode: normalizeSelectionMode(item.SelectionMode),
			Options:       options,
		})
	}
	return questions
}

func selectedOptionIDs(data *ApprovalResult) []string {
	if data == nil {
		return nil
	}
	if len(data.OptionIDs) > 0 {
		return normalizeSelectedIDs(data.OptionIDs, nil)
	}
	if strings.TrimSpace(data.OptionID) == "" {
		return nil
	}
	return []string{strings.TrimSpace(data.OptionID)}
}

func normalizeSelectedIDs(optionIDs []string, options []ApprovalOption) []string {
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(optionIDs))
	for _, optionID := range optionIDs {
		key := strings.TrimSpace(optionID)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}
	if len(normalized) == 0 && len(options) > 0 {
		return nil
	}
	return normalized
}

func findApprovalOptionByID(options []ApprovalOption, optionID string) *ApprovalOption {
	for idx := range options {
		if options[idx].ID == optionID {
			return &options[idx]
		}
	}
	return nil
}

func currentRecipeQuestionSelectionMode(state *textRecipeState) string {
	if state == nil {
		return "single"
	}
	return normalizeSelectionMode(state.SelectionMode)
}

func normalizeSelectionMode(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "multi") {
		return "multi"
	}
	return "single"
}

func nonEmpty(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func containsRecipePreferenceValue(items []string, target string) bool {
	target = strings.TrimSpace(target)
	for _, item := range items {
		if strings.TrimSpace(item) == target {
			return true
		}
	}
	return false
}

func pickExistingCoverImage(matches []RecipeCard) string {
	for _, item := range matches {
		if strings.TrimSpace(item.CoverImageURL) != "" {
			return strings.TrimSpace(item.CoverImageURL)
		}
	}
	return ""
}

func marshal(value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}
