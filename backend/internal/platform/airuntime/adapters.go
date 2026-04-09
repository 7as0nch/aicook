package airuntime

import "context"

// MemoryWriter 将用户明确要求「记住」的家庭级信息写入持久化存储。
type MemoryWriter interface {
	SaveHouseholdMemory(ctx context.Context, householdID, userID int64, scope, content, source string) error
}

type KnowledgeLookup interface {
	LookupKnowledgeSources(ctx context.Context, householdID int64, question string, limit int) ([]Source, error)
}

type RecipeLookup interface {
	SearchRecipesForAI(ctx context.Context, householdID int64, query string, limit int) ([]RecipeCard, error)
}

type ImageRecipeCreator interface {
	CreateImageRecipeCardForAI(ctx context.Context, householdID, userID int64, attachments []Attachment, titleHint string) (*RecipeCard, error)
}

func (r *Runtime) RegisterKnowledgeLookup(adapter KnowledgeLookup) {
	r.knowledgeLookup = adapter
}

func (r *Runtime) RegisterMemoryWriter(adapter MemoryWriter) {
	r.memoryWriter = adapter
}

func (r *Runtime) RegisterRecipeLookup(adapter RecipeLookup) {
	r.recipeLookup = adapter
}

func (r *Runtime) RegisterImageRecipeCreator(adapter ImageRecipeCreator) {
	r.imageRecipeCreator = adapter
}
