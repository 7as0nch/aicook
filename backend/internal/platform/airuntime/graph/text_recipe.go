package graph

import (
	"context"
	"fmt"
	"strings"
	"sync"

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
	QueryRecipes    func(context.Context, string, int) ([]Source, error)
	SearchWeb       func(context.Context, string) ([]Source, error)
	GenerateDraft   func(context.Context, TextRecipeRequest, []Source) (*TextRecipeDraft, error)
	NormalizeDraft  func(TextRecipeRequest, *TextRecipeDraft) (*TextRecipeDraft, error)
}

type textRecipeState struct {
	Sources []Source
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

	webNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "running"})
		if !input.WebSearchEnabled {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_web", Title: "text_recipe_web", Status: "skipped", Detail: "当前未开启网页搜索，先尝试家庭资料与菜谱库"})
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

	contextNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeRequest, error) {
		type collectResult struct {
			items []Source
			err   error
		}
		var (
			wg           sync.WaitGroup
			knowledgeRes collectResult
			recipeRes    collectResult
		)

		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_knowledge", Title: "text_recipe_knowledge", Status: "running"})
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_recipe_query", Title: "text_recipe_recipe_query", Status: "running"})

		if callbacks.LookupKnowledge != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				knowledgeRes.items, knowledgeRes.err = callbacks.LookupKnowledge(ctx, input.Query, 4)
			}()
		} else {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_knowledge", Title: "text_recipe_knowledge", Status: "skipped", Detail: "未配置家庭知识库"})
		}

		if callbacks.QueryRecipes != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				recipeRes.items, recipeRes.err = callbacks.QueryRecipes(ctx, input.Query, 4)
			}()
		} else {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_recipe_query", Title: "text_recipe_recipe_query", Status: "skipped", Detail: "未配置家庭菜谱库"})
		}

		wg.Wait()
		if knowledgeRes.err != nil {
			return TextRecipeRequest{}, knowledgeRes.err
		}
		if recipeRes.err != nil {
			return TextRecipeRequest{}, recipeRes.err
		}

		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, state *textRecipeState) error {
			state.Sources = append(state.Sources, knowledgeRes.items...)
			state.Sources = append(state.Sources, recipeRes.items...)
			state.Sources = dedupeTextRecipeSources(state.Sources)
			return nil
		})

		if callbacks.LookupKnowledge != nil {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_knowledge", Title: "text_recipe_knowledge", Status: "done", Detail: formatKnowledgeStepDetail(knowledgeRes.items)})
		}
		if callbacks.QueryRecipes != nil {
			appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_recipe_query", Title: "text_recipe_recipe_query", Status: "done", Detail: formatRecipeQueryStepDetail(recipeRes.items)})
		}
		return input, nil
	})

	generateNode := compose.InvokableLambda(func(ctx context.Context, input TextRecipeRequest) (TextRecipeRequest, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "text_recipe_generate", Title: "text_recipe_generate", Status: "running"})
		state := &textRecipeState{}
		_ = compose.ProcessState[*textRecipeState](ctx, func(_ context.Context, current *textRecipeState) error {
			*state = *current
			return nil
		})
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

	if err := g.AddLambdaNode("web", webNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("context", contextNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("generate", generateNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("validate", validateNode); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge(compose.START, "web"); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge("web", "context"); err != nil {
		return TextRecipeOutput{}, err
	}
	if err := g.AddEdge("context", "generate"); err != nil {
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

func formatKnowledgeStepDetail(results []Source) string {
	if len(results) == 0 {
		return "未命中知识库资料"
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("命中 %d 条相关资料", len(results)))
	for _, r := range results {
		title := strings.TrimSpace(r.Title)
		if title == "" {
			title = "（无标题）"
		}
		snip := truncateRunesForStep(r.Snippet, 140)
		b.WriteString("\n· ")
		if tag := knowledgeStepSourceTag(r.SourceKind); tag != "" {
			b.WriteString(tag)
			b.WriteString(" ")
		}
		b.WriteString(title)
		if snip != "" {
			b.WriteString(" — ")
			b.WriteString(snip)
		}
	}
	return b.String()
}

func knowledgeStepSourceTag(kind string) string {
	switch kind {
	case "memory":
		return "[长期记忆]"
	case "knowledge_base":
		return "[知识库]"
	case "knowledge_graph":
		return "[知识图谱]"
	default:
		return ""
	}
}

func formatRecipeQueryStepDetail(results []Source) string {
	if len(results) == 0 {
		return "未命中家庭菜谱库"
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("命中 %d 条家庭菜谱", len(results)))
	for _, r := range results {
		title := strings.TrimSpace(r.Title)
		if title == "" {
			title = "（无标题）"
		}
		snip := truncateRunesForStep(r.Snippet, 120)
		b.WriteString("\n· ")
		b.WriteString(title)
		if snip != "" {
			b.WriteString(" — ")
			b.WriteString(snip)
		}
	}
	return b.String()
}

func truncateRunesForStep(s string, max int) string {
	s = strings.TrimSpace(s)
	if s == "" || max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return string(r)
	}
	return string(r[:max]) + "…"
}

func dedupeTextRecipeSources(items []Source) []Source {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(items))
	results := make([]Source, 0, len(items))
	for _, item := range items {
		key := strings.TrimSpace(item.DocumentID) + "\n" + strings.TrimSpace(item.Title)
		if key == "\n" {
			key = strings.TrimSpace(item.Snippet)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		results = append(results, item)
	}
	return results
}
