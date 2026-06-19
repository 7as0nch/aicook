package kitchen

import "github.com/google/wire"

// ProviderSet 厨房域 service：厨房操作（库存/采购/计划）+ 烹饪进度。
var ProviderSet = wire.NewSet(
	NewKitchenService,
	NewCookingService,
)
