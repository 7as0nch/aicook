// Package biz 仅承担 wire ProviderSet 聚合，业务实现按域分散在 4 个子包：
//
//   biz/ai/      — AI 会话/消息/流式/知识库/语音
//   biz/recipe/  — 菜谱、收藏、导入、推荐
//   biz/kitchen/ — 厨房操作（库存/采购/计划）+ 烹饪进度/历史
//   biz/user/    — 账号、家庭、媒体资产
//
// 跨域共享的 Actor / ActorFromContext 放在 biz/common/。
package biz

import (
	"github.com/google/wire"

	"github.com/chengjiang/aicook/backend/internal/biz/ai"
	"github.com/chengjiang/aicook/backend/internal/biz/kitchen"
	"github.com/chengjiang/aicook/backend/internal/biz/recipe"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
)

var ProviderSet = wire.NewSet(
	ai.ProviderSet,
	recipe.ProviderSet,
	kitchen.ProviderSet,
	user.ProviderSet,
)
