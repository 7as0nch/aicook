package graph

import "context"

type Step struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type RecipeCard struct {
	RecipeID     string           `json:"recipe_id,omitempty"`
	Title        string           `json:"title"`
	Summary      string           `json:"summary"`
	CoverImageURL string          `json:"cover_image_url,omitempty"`
	Ingredients  []string         `json:"ingredients,omitempty"`
	Time         string           `json:"time,omitempty"`
	Difficulty   string           `json:"difficulty,omitempty"`
	Status       string           `json:"status,omitempty"`
	Source       string           `json:"source,omitempty"`
	IsRecipe     bool             `json:"is_recipe"`
	RejectReason string           `json:"reject_reason,omitempty"`
	Draft        *TextRecipeDraft `json:"draft,omitempty"`
}

type Source struct {
	Title      string `json:"title"`
	DocumentID string `json:"document_id"`
	Snippet    string `json:"snippet"`
	SourceKind string `json:"source_kind,omitempty"`
	SiteName   string `json:"site_name,omitempty"`
	PublishTime string `json:"publish_time,omitempty"`
	LogoURL    string `json:"logo_url,omitempty"`
}

type DraftIngredient struct {
	GroupName   string `json:"group_name"`
	Name        string `json:"name"`
	AmountText  string `json:"amount_text"`
	Preparation string `json:"preparation"`
}

type DraftStep struct {
	Title          string `json:"title"`
	Description    string `json:"description"`
	StepType       string `json:"step_type"`
	NeedTimer      bool   `json:"need_timer"`
	TimerSeconds   int    `json:"timer_seconds"`
	TimerAnimation string `json:"timer_animation"`
	EndCondition   string `json:"end_condition"`
}

type TextRecipeDraft struct {
	Title         string            `json:"title"`
	Summary       string            `json:"summary"`
	Category      string            `json:"category"`
	CoverImageURL string            `json:"cover_image_url,omitempty"`
	TotalMinutes  int               `json:"total_minutes"`
	Difficulty    int               `json:"difficulty"`
	Tools         []string          `json:"tools,omitempty"`
	ScenarioTags  []string          `json:"scenario_tags,omitempty"`
	FlavorTags    []string          `json:"flavor_tags,omitempty"`
	Ingredients   []DraftIngredient `json:"ingredients"`
	Steps         []DraftStep       `json:"steps"`
}

type TextRecipePreferences struct {
	Flavor     string `json:"flavor,omitempty"`
	Duration   string `json:"duration,omitempty"`
	Difficulty string `json:"difficulty,omitempty"`
	Style      string `json:"style,omitempty"`
	Constraints []string `json:"constraints,omitempty"`
}

type Input struct {
	Text string
}

type Output struct {
	Steps      []Step
	Card       *RecipeCard
	Content    string
	IsRecipe   bool
	RejectHint string
}

type Executor interface {
	Classify(ctx context.Context, input Input) (bool, string, error)
	Create(ctx context.Context, input Input) (*RecipeCard, error)
}
