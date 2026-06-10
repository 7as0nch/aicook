package kitchen

import "github.com/google/wire"

var ProviderSet = wire.NewSet(
	NewKitchenOpsUsecase,
	NewCookingProgressUsecase,
	NewCookingHistoryUsecase,
)
