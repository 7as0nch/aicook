package airtool

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
	"github.com/cloudwego/eino/schema"
)

type Source struct {
	Title      string `json:"title"`
	DocumentID string `json:"document_id"`
	Snippet    string `json:"snippet"`
}

type RecipeCard struct {
	RecipeID     string   `json:"recipe_id,omitempty"`
	Title        string   `json:"title"`
	Summary      string   `json:"summary"`
	CoverImageURL string  `json:"cover_image_url,omitempty"`
	Ingredients  []string `json:"ingredients,omitempty"`
	Time         string   `json:"time,omitempty"`
	Difficulty   string   `json:"difficulty,omitempty"`
	Status       string   `json:"status,omitempty"`
	Source       string   `json:"source,omitempty"`
	IsRecipe     bool     `json:"is_recipe"`
	RejectReason string   `json:"reject_reason,omitempty"`
	Draft        *TextRecipeDraft `json:"draft,omitempty"`
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

type TextRecipeDraft struct {
	Title         string           `json:"title"`
	Summary       string           `json:"summary"`
	Category      string           `json:"category"`
	CoverImageURL string           `json:"cover_image_url,omitempty"`
	TotalMinutes  int              `json:"total_minutes"`
	Difficulty    int              `json:"difficulty"`
	Tools         []string         `json:"tools,omitempty"`
	ScenarioTags  []string         `json:"scenario_tags,omitempty"`
	FlavorTags    []string         `json:"flavor_tags,omitempty"`
	Ingredients   []DraftIngredient `json:"ingredients"`
	Steps         []DraftStep      `json:"steps"`
}

type TextRecipePreferences struct {
	Flavor     string `json:"flavor,omitempty"`
	Duration   string `json:"duration,omitempty"`
	Difficulty string `json:"difficulty,omitempty"`
	Style      string `json:"style,omitempty"`
}

type ApprovalOption struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Summary    string      `json:"summary,omitempty"`
	RecipeCard *RecipeCard `json:"recipe_card,omitempty"`
}

type ApprovalInterrupt struct {
	Kind    string           `json:"kind"`
	Prompt  string           `json:"prompt"`
	Options []ApprovalOption `json:"options,omitempty"`
}

type ApprovalResult struct {
	Approved bool   `json:"approved"`
	OptionID string `json:"option_id"`
}

type QueryArgs struct {
	Query string `json:"query"`
	Limit int    `json:"limit,omitempty"`
}

type ImageRecipeArgs struct {
	TitleHint string `json:"title_hint,omitempty"`
}

type SearchResult struct {
	Query   string   `json:"query"`
	Results []Source `json:"results"`
}

type RecipeQueryResult struct {
	Query   string       `json:"query"`
	Matches []RecipeCard `json:"matches"`
}

type ImageRecipeResult struct {
	Card *RecipeCard `json:"card,omitempty"`
}

type RecommendResult struct {
	Status    string          `json:"status"`
	Selection *ApprovalOption `json:"selection,omitempty"`
	Card      *RecipeCard     `json:"card,omitempty"`
	Summary   string          `json:"summary,omitempty"`
}

type recipeRecommendState struct {
	Prompt  string           `json:"prompt"`
	Options []ApprovalOption `json:"options"`
}

type TextRecipeResult struct {
	Status  string      `json:"status"`
	Summary string      `json:"summary,omitempty"`
	Card    *RecipeCard `json:"card,omitempty"`
	Sources []Source    `json:"sources,omitempty"`
}

type textRecipeState struct {
	Query         string                `json:"query"`
	Prompt        string                `json:"prompt"`
	Options       []ApprovalOption      `json:"options"`
	Stage         string                `json:"stage"`
	Preferences   TextRecipePreferences `json:"preferences"`
	CoverImageURL string                `json:"cover_image_url,omitempty"`
}

func init() {
	schema.Register[*ApprovalInterrupt]()
	schema.Register[*ApprovalResult]()
	schema.Register[*recipeRecommendState]()
	schema.Register[*textRecipeState]()
}

func NewWebSearchTool(search func(context.Context, string) ([]Source, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("web_search", "使用 DuckDuckGo 检索最新网页结果。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("search query is empty")
		}
		results, err := search(ctx, query)
		if err != nil {
			return "", err
		}
		return marshal(SearchResult{Query: query, Results: results})
	})
}

func NewKnowledgeLookupTool(lookup func(context.Context, string, int) ([]Source, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("knowledge_lookup", "查询当前家庭知识库中的相关资料。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("knowledge query is empty")
		}
		limit := input.Limit
		if limit <= 0 {
			limit = 4
		}
		results, err := lookup(ctx, query, limit)
		if err != nil {
			return "", err
		}
		return marshal(SearchResult{Query: query, Results: results})
	})
}

func NewRecipeQueryTool(query func(context.Context, string, int) ([]RecipeCard, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("recipe_query", "查询家庭菜谱库中的可用菜谱。", func(ctx context.Context, input QueryArgs) (string, error) {
		rawQuery := strings.TrimSpace(input.Query)
		if rawQuery == "" {
			return "", fmt.Errorf("recipe query is empty")
		}
		limit := input.Limit
		if limit <= 0 {
			limit = 5
		}
		matches, err := query(ctx, rawQuery, limit)
		if err != nil {
			return "", err
		}
		return marshal(RecipeQueryResult{Query: rawQuery, Matches: matches})
	})
}

func NewImageRecipeCreateTool(create func(context.Context, string) (*RecipeCard, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("image_recipe_create", "基于当前上传图片生成菜谱确认卡片。", func(ctx context.Context, input ImageRecipeArgs) (string, error) {
		card, err := create(ctx, strings.TrimSpace(input.TitleHint))
		if err != nil {
			return "", err
		}
		return marshal(ImageRecipeResult{Card: card})
	})
}

func NewRecipeRecommendTool(search func(context.Context, string, int) ([]RecipeCard, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool("recipe_recommend", "根据用户想做的菜或口味偏好，给出候选菜谱并等待用户确认。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("recommend query is empty")
		}

		wasInterrupted, hasState, state := einotool.GetInterruptState[*recipeRecommendState](ctx)
		if !wasInterrupted {
			limit := input.Limit
			if limit <= 0 {
				limit = 4
			}
			matches, err := search(ctx, query, limit)
			if err != nil {
				return "", err
			}
			if len(matches) == 0 {
				return marshal(RecommendResult{
					Status:  "empty",
					Summary: "没有找到合适的候选菜谱，请换一种口味或菜名试试。",
				})
			}

			options := make([]ApprovalOption, 0, len(matches))
			for idx, item := range matches {
				optionID := item.RecipeID
				if optionID == "" {
					optionID = fmt.Sprintf("recipe_%d", idx+1)
				}
				card := item
				options = append(options, ApprovalOption{
					ID:         optionID,
					Title:      item.Title,
					Summary:    item.Summary,
					RecipeCard: &card,
				})
			}
			state := &recipeRecommendState{
				Prompt:  fmt.Sprintf("我先帮你筛了 %d 个更贴近需求的菜谱，选一个我继续整理成确认卡片。", len(options)),
				Options: options,
			}
			return "", einotool.StatefulInterrupt(ctx, &ApprovalInterrupt{
				Kind:    "recipe_recommend",
				Prompt:  state.Prompt,
				Options: state.Options,
			}, state)
		}

		if !hasState || state == nil {
			return "", fmt.Errorf("approval state is missing")
		}
		isTarget, hasData, data := einotool.GetResumeContext[*ApprovalResult](ctx)
		if !isTarget {
			return "", einotool.StatefulInterrupt(ctx, &ApprovalInterrupt{
				Kind:    "recipe_recommend",
				Prompt:  state.Prompt,
				Options: state.Options,
			}, state)
		}
		if !hasData || data == nil || !data.Approved {
			return marshal(RecommendResult{
				Status:  "cancelled",
				Summary: "这次先不继续推荐，告诉我新的口味或菜名我再帮你找。",
			})
		}

		for _, option := range state.Options {
			if option.ID != data.OptionID {
				continue
			}
			return marshal(RecommendResult{
				Status:    "selected",
				Selection: &option,
				Card:      option.RecipeCard,
				Summary:   fmt.Sprintf("已选择「%s」，我继续整理成确认卡片。", option.Title),
			})
		}

		return marshal(RecommendResult{
			Status:  "cancelled",
			Summary: "没有找到对应候选，请重新选择一次。",
		})
	})
}

func NewRecipeGenerateTool(
	searchExisting func(context.Context, string, int) ([]RecipeCard, error),
	generate func(context.Context, string, TextRecipePreferences, string) (*TextRecipeResult, error),
) (einotool.BaseTool, error) {
	return toolutils.InferTool("recipe_generate", "为用户生成可确认保存的新菜谱；若已有近似菜谱则先让用户确认。", func(ctx context.Context, input QueryArgs) (string, error) {
		query := strings.TrimSpace(input.Query)
		if query == "" {
			return "", fmt.Errorf("recipe generate query is empty")
		}

		wasInterrupted, hasState, state := einotool.GetInterruptState[*textRecipeState](ctx)
		if !wasInterrupted {
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
			state := &textRecipeState{
				Query:   query,
				Stage:   "preference_flavor",
				Prompt:  "先定一下这道菜的口味偏好。",
				Options: buildTextRecipePreferenceOptions("preference_flavor"),
			}
			return interruptTextRecipeStage(ctx, state)
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
			state.Stage = "preference_flavor"
			state.Prompt = "先定一下这道菜的口味偏好。"
			state.Options = buildTextRecipePreferenceOptions(state.Stage)
			return interruptTextRecipeStage(ctx, state)
		case "preference_flavor":
			state.Preferences.Flavor = resolveTextRecipePreferenceLabel(state.Options, data.OptionID)
			state.Stage = "preference_duration"
			state.Prompt = "再选一下你希望控制在什么耗时范围。"
			state.Options = buildTextRecipePreferenceOptions(state.Stage)
			return interruptTextRecipeStage(ctx, state)
		case "preference_duration":
			state.Preferences.Duration = resolveTextRecipePreferenceLabel(state.Options, data.OptionID)
			state.Stage = "preference_difficulty"
			state.Prompt = "这次想做成什么难度？"
			state.Options = buildTextRecipePreferenceOptions(state.Stage)
			return interruptTextRecipeStage(ctx, state)
		case "preference_difficulty":
			state.Preferences.Difficulty = resolveTextRecipePreferenceLabel(state.Options, data.OptionID)
			state.Stage = "preference_style"
			state.Prompt = "最后定一下这版菜谱的风格。"
			state.Options = buildTextRecipePreferenceOptions(state.Stage)
			return interruptTextRecipeStage(ctx, state)
		case "preference_style":
			state.Preferences.Style = resolveTextRecipePreferenceLabel(state.Options, data.OptionID)
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
	return "", einotool.StatefulInterrupt(ctx, &ApprovalInterrupt{
		Kind:    kind,
		Prompt:  state.Prompt,
		Options: state.Options,
	}, state)
}

func buildTextRecipePreferenceOptions(stage string) []ApprovalOption {
	switch stage {
	case "preference_flavor":
		return []ApprovalOption{
			{ID: "flavor_light", Title: "清淡一点", Summary: "更突出原味，少油少盐。"},
			{ID: "flavor_rich", Title: "下饭浓郁", Summary: "酱香更足，更适合拌饭。"},
			{ID: "flavor_sweet", Title: "偏甜口", Summary: "适合红烧、糖醋这类风格。"},
			{ID: "flavor_salty", Title: "偏咸香", Summary: "味道更厚重，突出咸鲜。"},
			{ID: "flavor_spicy", Title: "微辣", Summary: "略带辣味，更开胃。"},
		}
	case "preference_duration":
		return []ApprovalOption{
			{ID: "duration_fast", Title: "20 分钟内", Summary: "尽量压缩步骤，做成快手版。"},
			{ID: "duration_medium", Title: "40 分钟内", Summary: "兼顾口味和效率。"},
			{ID: "duration_long", Title: "1 小时左右", Summary: "可以接受更完整的炖煮或准备。"},
			{ID: "duration_free", Title: "不限", Summary: "以味道和效果优先。"},
		}
	case "preference_difficulty":
		return []ApprovalOption{
			{ID: "difficulty_easy", Title: "简单", Summary: "步骤更少，适合日常快速做。"},
			{ID: "difficulty_medium", Title: "中等", Summary: "保留关键做法，复杂度适中。"},
			{ID: "difficulty_hard", Title: "进阶", Summary: "更讲究火候和细节。"},
		}
	case "preference_style":
		return []ApprovalOption{
			{ID: "style_home", Title: "家常版", Summary: "适合家庭灶台和常见食材。"},
			{ID: "style_authentic", Title: "正宗一点", Summary: "尽量还原更经典的做法。"},
			{ID: "style_quick", Title: "快手改良版", Summary: "保留特点但简化流程。"},
		}
	default:
		return nil
	}
}

func resolveTextRecipePreferenceLabel(options []ApprovalOption, optionID string) string {
	for _, option := range options {
		if option.ID == optionID {
			return option.Title
		}
	}
	return strings.TrimSpace(optionID)
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
