package graph

import (
	"context"
	"strings"
)

type ImageRecipeConfig struct {
	Text     string
	HasImage bool
	Create   func(context.Context, string) (*RecipeCard, error)
}

type imageRecipeExecutor struct {
	config ImageRecipeConfig
}

func (e imageRecipeExecutor) Classify(_ context.Context, input Input) (bool, string, error) {
	if !e.config.HasImage {
		return false, "没有检测到图片附件，无法执行图文识别。", nil
	}
	text := strings.TrimSpace(input.Text)
	if text == "" {
		return true, "", nil
	}
	for _, keyword := range []string{"菜谱", "做法", "步骤", "食材", "教程"} {
		if strings.Contains(text, keyword) {
			return true, "", nil
		}
	}
	return true, "", nil
}

func (e imageRecipeExecutor) Create(ctx context.Context, input Input) (*RecipeCard, error) {
	if e.config.Create == nil {
		return nil, nil
	}
	card, err := e.config.Create(ctx, input.Text)
	if err != nil {
		return nil, err
	}
	if card == nil {
		return &RecipeCard{
			Title:        "非菜谱图片",
			Summary:      "该图片不是完整菜谱流程，暂不建议直接入库。",
			Status:       "rejected",
			Source:       "image_recipe",
			IsRecipe:     false,
			RejectReason: "该图片不是完整菜谱流程，暂不建议直接入库。",
		}, nil
	}
	return card, nil
}

func RunImageRecipe(ctx context.Context, config ImageRecipeConfig, opts ...Option) (Output, error) {
	runner, err := NewRunner(ctx, imageRecipeExecutor{config: config}, opts...)
	if err != nil {
		return Output{}, err
	}
	return runner.Invoke(ctx, Input{Text: strings.TrimSpace(config.Text)})
}
