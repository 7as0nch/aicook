package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/compose"
)

type ImageRecipeConfig struct {
	Text     string
	HasImage bool
	Create   func(context.Context, string) (*RecipeCard, error)
}

func RunImageRecipe(ctx context.Context, config ImageRecipeConfig, opts ...Option) (ImageRecipeOutput, error) {
	cfg := runnerConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}

	type classified struct {
		Text       string
		HasImage   bool
		IsRecipe   bool
		RejectHint string
	}

	g := compose.NewGraph[ImageRecipeConfig, ImageRecipeOutput](compose.WithGenLocalState(func(context.Context) *state {
		return &state{steps: []Step{}}
	}))

	inspect := compose.InvokableLambda(func(ctx context.Context, input ImageRecipeConfig) (ImageRecipeConfig, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "ocr", Title: "inspect_image", Status: "done"})
		appendStep(ctx, cfg.onStep, Step{ID: "classify", Title: "classify_recipe", Status: "running"})
		input.Text = strings.TrimSpace(input.Text)
		return input, nil
	})

	classify := compose.InvokableLambda(func(ctx context.Context, input ImageRecipeConfig) (classified, error) {
		result := classified{Text: input.Text, HasImage: input.HasImage}
		if !input.HasImage {
			result.RejectHint = "没有检测到图片附件，无法执行图文识别。"
			appendStep(ctx, cfg.onStep, Step{ID: "classify_result", Title: "classification_result", Status: "done", Detail: defaultRejectHint(result.RejectHint)})
			return result, nil
		}
		result.IsRecipe = true
		appendStep(ctx, cfg.onStep, Step{ID: "classify_result", Title: "classification_result", Status: "done", Detail: ternary(result.IsRecipe, "recipe_detected", defaultRejectHint(result.RejectHint))})
		return result, nil
	})

	persist := compose.InvokableLambda(func(ctx context.Context, input classified) (ImageRecipeOutput, error) {
		out := ImageRecipeOutput{
			IsRecipe:   input.IsRecipe,
			RejectHint: defaultRejectHint(input.RejectHint),
		}
		if input.IsRecipe {
			if config.Create == nil {
				return ImageRecipeOutput{}, fmt.Errorf("image recipe create callback is nil")
			}
			card, err := config.Create(ctx, input.Text)
			if err != nil {
				return ImageRecipeOutput{}, err
			}
			if card == nil {
				card = &RecipeCard{
					Title:        "非菜谱图片",
					Summary:      "该图片不是完整菜谱流程，暂不建议直接入库。",
					Status:       "rejected",
					Source:       "image_recipe",
					IsRecipe:     false,
					RejectReason: "该图片不是完整菜谱流程，暂不建议直接入库。",
				}
				out.IsRecipe = false
				out.RejectHint = card.RejectReason
			}
			out.Card = card
			out.Content = strings.TrimSpace(card.Summary)
			if out.Content == "" {
				out.Content = ternary(out.IsRecipe, "recipe draft generated, please confirm before saving", defaultRejectHint(out.RejectHint))
			}
			appendStep(ctx, cfg.onStep, Step{ID: "persist", Title: "persist_recipe_draft", Status: ternary(out.IsRecipe, "done", "skipped")})
		} else {
			out.Content = out.RejectHint
			appendStep(ctx, cfg.onStep, Step{ID: "persist", Title: "persist_recipe_draft", Status: "skipped"})
		}
		_ = compose.ProcessState[*state](ctx, func(_ context.Context, s *state) error {
			out.Steps = append(out.Steps, s.steps...)
			return nil
		})
		return out, nil
	})

	if err := g.AddLambdaNode("inspect", inspect); err != nil {
		return ImageRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("classify", classify); err != nil {
		return ImageRecipeOutput{}, err
	}
	if err := g.AddLambdaNode("persist", persist); err != nil {
		return ImageRecipeOutput{}, err
	}
	if err := g.AddEdge(compose.START, "inspect"); err != nil {
		return ImageRecipeOutput{}, err
	}
	if err := g.AddEdge("inspect", "classify"); err != nil {
		return ImageRecipeOutput{}, err
	}
	if err := g.AddEdge("classify", "persist"); err != nil {
		return ImageRecipeOutput{}, err
	}
	if err := g.AddEdge("persist", compose.END); err != nil {
		return ImageRecipeOutput{}, err
	}

	runnable, err := g.Compile(ctx)
	if err != nil {
		return ImageRecipeOutput{}, err
	}
	return runnable.Invoke(ctx, ImageRecipeConfig{Text: strings.TrimSpace(config.Text), HasImage: config.HasImage, Create: config.Create})
}
