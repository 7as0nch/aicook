package recipe

import "github.com/google/wire"

// ProviderSet 菜谱域 service：菜谱/收藏/推荐 + 导入。
var ProviderSet = wire.NewSet(
	NewRecipeService,
	NewImportService,
)
