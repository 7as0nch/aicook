// Package service 仅承担 wire ProviderSet 聚合，HTTP/gRPC handler 按域分散在 4 个子包：
//
//	service/ai/      — AI 会话/消息/流式、知识库、语音
//	service/recipe/  — 菜谱、收藏、推荐、导入
//	service/kitchen/ — 厨房操作（库存/采购/计划）+ 烹饪进度
//	service/user/    — 账号鉴权、家庭/成员、媒体资产
//
// 跨域共享的 proto<->model 转换与媒体签名放在 service/convert/，与 biz 的分层一一对应。
package service

import (
	"github.com/google/wire"

	"github.com/chengjiang/aicook/backend/internal/service/ai"
	"github.com/chengjiang/aicook/backend/internal/service/kitchen"
	"github.com/chengjiang/aicook/backend/internal/service/recipe"
	"github.com/chengjiang/aicook/backend/internal/service/user"
)

var ProviderSet = wire.NewSet(
	ai.ProviderSet,
	recipe.ProviderSet,
	kitchen.ProviderSet,
	user.ProviderSet,
)
