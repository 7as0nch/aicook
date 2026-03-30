package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/compose"
)

type TextRecipeRequest struct {
	Query            string
	WebSearchEnabled bool
	Preferences       TextRecipePreferences
	SeedCoverImageURL string
}

type TextRecipeOutput struct {
	Status  string
	Summary string
	Card    *RecipeCard
	Sources []Source
}

type TextRecipeCallbacks struct {
	LookupKnowledge func(context.Context, string, int) ([]Source, error)
	SearchWeb       func(context.Context, string) ([]Source, error)
	GenerateDraft   func(context.Context, TextRecipeRequest, []Source) (*TextRecipeDraft, error)
	NormalizeDraft  func(TextRecipeRequest, *TextRecipeDraft) (*TextRecipeDraft, error)
}

type textRecipeState struct {
	Sources []Source
	NeedWeb bool
	Draft   *TextRecipeDraft
}

func RunTextRecipe(ctx context.Context, req TextRecipeRequest, callbacks TextRecipeCallbacks, opts ...Option) (TextRecipeOutput, error) {
	query := strings.TrimSpace(req.Query)
	if query == "" {
		return TextRecipeOutput{}, fmt.Errorf("recipe query is empty")
	}

	cfg := runnerConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}

	g := compose.NewGraph[TextRecipeRequest, TextRecipeOutput](compose.WithGenLocalState(func(context.Context) *textRecipeState {
		return &textRecipeState{}
	}))

	knowledgeNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_knowledge", Title: "text_recipe_knowledge", Status: "running"})
		if callbacks.LookupKnowledge == nil {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_knowledge", Title: "text_recipe_knowledge", Status: "skipped", Detail: "未配置家庭知识库"})
			return input, nil
		}
		results, err := callbacks.LookupKnowledge(ctx, input.Query, 4)
		if err != nil {
			return TextRecipeRequest{}, err
		}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, state *textRecipeState) error {
			state.Sources = append(state.Sources, results...)
			return nil
		})
		detail := "未命中知识库资料"
		if len(results) > 0 {
			detail = fmt.Sprintf("命中 %d 条家庭知识资料", len(results))
		}
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_knowledge", Title: "text_recipe_knowledge", Status: "done", Detail: detail})
		return input, nil
	})

	webNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "running"})
		state := &textRecipeState{}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
			*state = *current
			return nil
		})
		if len(state.Sources) > 0 {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "skipped", Detail: "已有足够上下文，跳过联网检索"})
			return input, nil
		}
		if !input.WebSearchEnabled {
			_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
				current.NeedWeb = true
				return nil
			})
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "blocked", Detail: "需要联网检索，但当前未开启联网能力"})
			return input, nil
		}
		if callbacks.SearchWeb == nil {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "skipped", Detail: "未配置网页检索能力"})
			return input, nil
		}
		results, err := callbacks.SearchWeb(ctx, input.Query)
		if err != nil {
			return TextRecipeRequest{}, err
		}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
			current.Sources = append(current.Sources, results...)
			return nil
		})
		detail := "未获取到网页结果，将尝试基于已有问题直接生成"
		if len(results) > 0 {
			detail = fmt.Sprintf("补充了 %d 条网页结果", len(results))
		}
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "done", Detail: detail})
		return input, nil
	})

	generateNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_generate", Title: "text_recipe_generate", Status: "running"})
		state := &textRecipeState{}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
			*state = *current
			return nil
		})
		if state.NeedWeb {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_generate", Title: "text_recipe_generate", Status: "skipped", Detail: "等待用户开启联网后再生成"})
			return input, nil
		}
		if callbacks.GenerateDraft == nil {
			return TextRecipeRequest{}, fmt.Errorf("text recipe generate callback is nil")
		}
		draft, err := callbacks.GenerateDraft(ctx, input, state.Sources)
		if err != nil {
			return TextRecipeRequest{}, err
		}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
			current.Draft = draft
			return nil
		})
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_generate", Title: "text_recipe_generate", Status: "done", Detail: "已完成结构化草稿生成"})
		return input, nil
	})

	validateNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeOutput, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_validate", Title: "text_recipe_validate", Status: "running"})
		state := &textRecipeState{}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
			*state = *current
			return nil
		})
		if state.NeedWeb {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_validate", Title: "text_recipe_validate", Status: "skipped", Detail: "当前缺少联网结果，已暂停生成"})
			return TextRecipeOutput{
				Status:  "need_web",
				Summary: "请开启联网能力让我帮你检索，我再继续为你生成这道菜谱。",
				Sources: append([]Source(nil), state.Sources...),
			}, nil
		}
		if state.Draft == nil {
			return TextRecipeOutput{
				Status:  "empty",
				Summary: "暂时没能整理出完整菜谱，请换一种说法再试一次。",
				Sources: append([]Source(nil), state.Sources...),
			}, nil
		}
		if callbacks.NormalizeDraft == nil {
			return TextRecipeOutput{}, fmt.Errorf("text recipe normalize callback is nil")
		}
		draft, err := callbacks.NormalizeDraft(input, state.Draft)
		if err != nil {
			return TextRecipeOutput{}, err
		}
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_validate", Title: "text_recipe_validate", Status: "done", Detail: "菜谱草稿通过校验，可生成确认卡片"})
		return TextRecipeOutput{
			Status:  "generated",
			Summary: "已根据当前资料生成完整菜谱草稿，请确认后保存。",
			Card:    BuildTextRecipeCard(draft),
			Sources: append([]Source(nil), state.Sources...),
		}, nil
	})

	if err := g.AddLambdaNode("knowledge", knowledgeNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("web", webNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("generate", generateNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("validate", validateNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge(compose.START, "knowledge"); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge("knowledge", "web"); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge("web", "generate"); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge("generate", "validate"); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge("validate", compose.END); err != nil {
		return TextRecipeOutput{}, err
	}

	runnable, err := g.Compile(ctx)
	if err != nil {
		return TextRecipeOutput{}, err
	}
	return runnable.Invoke(ctx, TextRecipeRequest{
		Query:            query,
		WebSearchEnabled: req.WebSearchEnabled,
	})
}

func BuildTextRecipeCard(draft *TextRecipeDraft) *RecipeCard {
	ingredients := make([]string, 0, len(draft.Ingredients))
	for _, item := range draft.Ingredients {
		if name := strings.TrimSpace(item.Name); name != "" {
			ingredients = append(ingredients, name)
		}
		if len(ingredients) >= 6 {
			break
		}
	}
	return &RecipeCard{
		Title:       draft.Title,
		Summary:     draft.Summary,
		CoverImageURL: strings.TrimSpace(draft.CoverImageURL),
		Ingredients: ingredients,
		Time:        formatTextRecipeMinutes(draft.TotalMinutes),
		Difficulty:  formatTextRecipeDifficulty(draft.Difficulty),
		Status:      "draft",
		Source:      "text_recipe_ai",
		IsRecipe:    true,
		Draft:       draft,
	}
}

func formatTextRecipeMinutes(minutes int) string {
	if minutes <= 0 {
		return "时长待确认"
	}
	return fmt.Sprintf("%d 分钟", minutes)
}

func formatTextRecipeDifficulty(level int) string {
	if level <= 0 {
		return "待确认"
	}
	if level > 5 {
		level = 5
	}
	return fmt.Sprintf("%s %d", strings.Repeat("★", level), level)
}
