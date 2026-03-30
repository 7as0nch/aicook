package airuntime

import "context"

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

func (r *Runtime) RegisterRecipeLookup(adapter RecipeLookup) {
	r.recipeLookup = adapter
}

func (r *Runtime) RegisterImageRecipeCreator(adapter ImageRecipeCreator) {
	r.imageRecipeCreator = adapter
}
