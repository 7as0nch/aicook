package airtool

import "github.com/cloudwego/eino/schema"

type Source struct {
	Title       string `json:"title"`
	DocumentID  string `json:"document_id"`
	Snippet     string `json:"snippet"`
	SourceKind  string `json:"source_kind,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
	PublishTime string `json:"publish_time,omitempty"`
	LogoURL     string `json:"logo_url,omitempty"`
}

type RecipeCard struct {
	RecipeID      string           `json:"recipe_id,omitempty"`
	Title         string           `json:"title"`
	Summary       string           `json:"summary"`
	CoverImageURL string           `json:"cover_image_url,omitempty"`
	Ingredients   []string         `json:"ingredients,omitempty"`
	Time          string           `json:"time,omitempty"`
	Difficulty    string           `json:"difficulty,omitempty"`
	Status        string           `json:"status,omitempty"`
	Source        string           `json:"source,omitempty"`
	IsRecipe      bool             `json:"is_recipe"`
	RejectReason  string           `json:"reject_reason,omitempty"`
	Draft         *TextRecipeDraft `json:"draft,omitempty"`
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

type ApprovalOption struct {
	ID            string      `json:"id"`
	Title         string      `json:"title"`
	Summary       string      `json:"summary,omitempty"`
	RecipeCard    *RecipeCard `json:"recipe_card,omitempty"`
	PreferenceKey string      `json:"preference_key,omitempty"`
	Value         string      `json:"value,omitempty"`
}

type ApprovalInterrupt struct {
	Kind              string           `json:"kind"`
	Prompt            string           `json:"prompt"`
	Options           []ApprovalOption `json:"options,omitempty"`
	SelectionMode     string           `json:"selection_mode,omitempty"`
	StepIndex         int              `json:"step_index,omitempty"`
	StepTotal         int              `json:"step_total,omitempty"`
	AllowSkip         bool             `json:"allow_skip,omitempty"`
	SelectedOptionIDs []string         `json:"selected_option_ids,omitempty"`
}

type ApprovalResult struct {
	Approved  bool     `json:"approved"`
	OptionID   string   `json:"option_id"`
	OptionIDs []string `json:"option_ids,omitempty"`
}

type RecipePreferenceQuestion struct {
	ID            string           `json:"id"`
	Prompt        string           `json:"prompt"`
	SelectionMode string           `json:"selection_mode,omitempty"`
	Options       []ApprovalOption `json:"options,omitempty"`
}

type RecipePreferencePlan struct {
	Questions []RecipePreferenceQuestion `json:"questions,omitempty"`
}

func init() {
	schema.Register[*ApprovalInterrupt]()
	schema.Register[*ApprovalResult]()
	schema.Register[*recipeRecommendState]()
	schema.Register[*textRecipeState]()
}
