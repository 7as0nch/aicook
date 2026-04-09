package airtool

import (
	"context"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
)

type ImageRecipeArgs struct {
	TitleHint string `json:"title_hint,omitempty"`
}

type ImageRecipeResult struct {
	Card *RecipeCard `json:"card,omitempty"`
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
