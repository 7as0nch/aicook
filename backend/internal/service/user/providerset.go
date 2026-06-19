package user

import "github.com/google/wire"

// ProviderSet 用户域 service：账号鉴权、家庭/成员、媒体资产。
var ProviderSet = wire.NewSet(
	NewAuthService,
	NewHouseholdService,
	NewMediaService,
)
