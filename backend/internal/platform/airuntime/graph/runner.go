package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/compose"
)

type state struct {
	steps []Step
}

type Runner struct {
	runnable compose.Runnable[Input, Output]
}

type runnerConfig struct {
	onStep func(context.Context, Step)
}

type Option func(*runnerConfig)

func WithStepObserver(fn func(context.Context, Step)) Option {
	return func(cfg *runnerConfig) {
		cfg.onStep = fn
	}
}

func NewRunner(ctx context.Context, executor Executor, opts ...Option) (*Runner, error) {
	cfg := runnerConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}

	g := compose.NewGraph[Input, Output](compose.WithGenLocalState(func(context.Context) *state {
		return &state{steps: []Step{}}
	}))

	inspect := compose.InvokableLambda(func(ctx context.Context, input Input) (Input, error) {
		appendStep(ctx, cfg.onStep, Step{ID: "ocr", Title: "inspect_image", Status: "done"})
		appendStep(ctx, cfg.onStep, Step{ID: "classify", Title: "classify_recipe", Status: "running"})
		return input, nil
	})

	type classified struct {
		Input
		IsRecipe   bool
		RejectHint string
	}

	classify := compose.InvokableLambda(func(ctx context.Context, input Input) (classified, error) {
		ok, hint, err := executor.Classify(ctx, input)
		if err != nil {
			return classified{}, err
		}
		appendStep(ctx, cfg.onStep, Step{
			ID:     "classify_result",
			Title:  "classification_result",
			Status: "done",
			Detail: ternary(ok, "recipe_detected", defaultRejectHint(hint)),
		})
		return classified{Input: input, IsRecipe: ok, RejectHint: hint}, nil
	})

	persist := compose.InvokableLambda(func(ctx context.Context, input classified) (Output, error) {
		out := Output{
			IsRecipe:   input.IsRecipe,
			RejectHint: defaultRejectHint(input.RejectHint),
		}
		if input.IsRecipe {
			card, err := executor.Create(ctx, input.Input)
			if err != nil {
				return Output{}, err
			}
			out.Card = card
			out.Content = strings.TrimSpace(card.Summary)
			if out.Content == "" {
				out.Content = "recipe draft generated, please confirm before saving"
			}
			appendStep(ctx, cfg.onStep, Step{ID: "persist", Title: "persist_recipe_draft", Status: "done"})
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
		return nil, fmt.Errorf("add inspect node failed: %w", err)
	}
	if err := g.AddLambdaNode("classify", classify); err != nil {
		return nil, fmt.Errorf("add classify node failed: %w", err)
	}
	if err := g.AddLambdaNode("persist", persist); err != nil {
		return nil, fmt.Errorf("add persist node failed: %w", err)
	}
	if err := g.AddEdge(compose.START, "inspect"); err != nil {
		return nil, err
	}
	if err := g.AddEdge("inspect", "classify"); err != nil {
		return nil, err
	}
	if err := g.AddEdge("classify", "persist"); err != nil {
		return nil, err
	}
	if err := g.AddEdge("persist", compose.END); err != nil {
		return nil, err
	}

	runnable, err := g.Compile(ctx)
	if err != nil {
		return nil, err
	}
	return &Runner{runnable: runnable}, nil
}

func (r *Runner) Invoke(ctx context.Context, input Input) (Output, error) {
	return r.runnable.Invoke(ctx, input)
}
