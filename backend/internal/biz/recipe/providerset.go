package recipe

import "github.com/google/wire"

var ProviderSet = wire.NewSet(
	NewRecipeUsecase,
	NewRecipeFavoriteUsecase,
	NewImportUsecase,
	NewRecommendUsecase,
)
