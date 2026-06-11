package airuntime

type Mode string

const (
	ModeADK   Mode = "adk"
	ModeGraph Mode = "graph"
)

type Attachment struct {
	Type        string `json:"type"`
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
	Name        string `json:"name"`
	AssetID     string `json:"asset_id,omitempty"`
}

type QuoteContext struct {
	SelectedText    string `json:"selected_text"`
	SelectionSource string `json:"selection_source"`
	SurroundingText string `json:"surrounding_text"`
	Scene           string `json:"scene"`
}

// SourceKind distinguishes household AI memory, uploaded KB chunks, and graph edges for UI and prompts.
const (
	SourceKindMemory         = "memory"
	SourceKindKnowledgeBase  = "knowledge_base"
	SourceKindKnowledgeGraph = "knowledge_graph"
)

type Source struct {
	Title       string `json:"title"`
	DocumentID  string `json:"document_id"`
	Snippet     string `json:"snippet"`
	SourceKind  string `json:"source_kind,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
	PublishTime string `json:"publish_time,omitempty"`
	LogoURL     string `json:"logo_url,omitempty"`
}

type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ActiveCookingSummary is injected into model prompts when the user has in-progress recipes.
type ActiveCookingSummary struct {
	RecipeID         int64  `json:"recipe_id"`
	Title            string `json:"title"`
	StepIndex        int    `json:"step_index"`
	TotalSteps       int    `json:"total_steps"`
	RemainingSeconds int    `json:"remaining_seconds"`
	CookPath         string `json:"cook_path"`
}

type ReplyRequest struct {
	ConversationID     string                 `json:"conversation_id,omitempty"`
	HouseholdID        int64                  `json:"household_id"`
	UserID             int64                  `json:"user_id"`
	Scene              string                 `json:"scene"`
	Text               string                 `json:"text"`
	Attachments        []Attachment           `json:"attachments"`
	QuoteContext       QuoteContext           `json:"quote_context"`
	Sources            []Source               `json:"sources"`
	History            []HistoryMessage       `json:"history"`
	ReasoningEnabled   bool                   `json:"reasoning_enabled"`
	WebSearchEnabled   bool                   `json:"web_search_enabled"`
	ImageRecipeEnabled bool                   `json:"image_recipe_enabled"`
	InputSource        string                 `json:"input_source"`
	ApprovalResponse   *ApprovalResponse      `json:"approval_response,omitempty"`
	ActiveCooking      []ActiveCookingSummary `json:"active_cooking,omitempty"`
}

type ReplyResponse struct {
	Mode             Mode          `json:"mode"`
	Model            string        `json:"model"`
	Content          string        `json:"content"`
	ReasoningContent string        `json:"reasoning_content"`
	Sources          []Source      `json:"sources"`
	IsFallback       bool          `json:"is_fallback"`
	Metadata         ReplyMetadata `json:"metadata"`
}

type StreamEventKind string

const (
	StreamEventAnswer     StreamEventKind = "answer"
	StreamEventReasoning  StreamEventKind = "reasoning"
	StreamEventStatus     StreamEventKind = "status"
	StreamEventToolCall   StreamEventKind = "tool_call"
	StreamEventRecipeCard StreamEventKind = "recipe_card"
	StreamEventAgentCall  StreamEventKind = "agent_call"
	StreamEventApproval   StreamEventKind = "approval"
)

type StreamEvent struct {
	Kind      StreamEventKind `json:"kind"`
	RunID     string          `json:"run_id,omitempty"`
	MessageID string          `json:"message_id,omitempty"`
	Sequence  int             `json:"seq,omitempty"`
	PartType  string          `json:"part_type,omitempty"`
	CallID    string          `json:"call_id,omitempty"`
	Content   string          `json:"content"`
	Metadata  map[string]any  `json:"metadata,omitempty"`
}

type Intent string

const (
	IntentChat            Intent = "chat"
	IntentToolChat        Intent = "tool_chat"
	IntentImageRecipe     Intent = "image_recipe"
	IntentKnowledge       Intent = "knowledge"
	IntentRecipeQuery     Intent = "recipe_query"
	IntentRecipeRecommend Intent = "recipe_recommend"
	IntentRecipeCreate    Intent = "recipe_create"
)

type AgentTrace struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type WorkflowStep struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type ToolCallRecord struct {
	CallID    string `json:"call_id,omitempty"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Arguments string `json:"arguments,omitempty"`
	Result    string `json:"result,omitempty"`
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

type ApprovalOption struct {
	ID            string      `json:"id"`
	Title         string      `json:"title"`
	Summary       string      `json:"summary,omitempty"`
	RecipeCard    *RecipeCard `json:"recipe_card,omitempty"`
	PreferenceKey string      `json:"preference_key,omitempty"`
	Value         string      `json:"value,omitempty"`
}

type PendingApproval struct {
	ID                string           `json:"id"`
	Kind              string           `json:"kind"`
	Prompt            string           `json:"prompt"`
	Status            string           `json:"status,omitempty"`
	SelectionMode     string           `json:"selection_mode,omitempty"`
	StepIndex         int              `json:"step_index,omitempty"`
	StepTotal         int              `json:"step_total,omitempty"`
	AllowSkip         bool             `json:"allow_skip,omitempty"`
	SelectedOptionIDs []string         `json:"selected_option_ids,omitempty"`
	Options           []ApprovalOption `json:"options,omitempty"`
}

type ApprovalResponse struct {
	ApprovalID string          `json:"approval_id"`
	OptionID   string          `json:"option_id"`
	OptionIDs  []string        `json:"option_ids,omitempty"`
	Confirmed  bool            `json:"confirmed"`
	Selection  *ApprovalOption `json:"selection,omitempty"`
}

type TimelineEvent struct {
	Kind     StreamEventKind `json:"kind"`
	RunID    string          `json:"run_id,omitempty"`
	Sequence int             `json:"seq,omitempty"`
	PartType string          `json:"part_type,omitempty"`
	CallID   string          `json:"call_id,omitempty"`
	Content  string          `json:"content,omitempty"`
	Metadata map[string]any  `json:"metadata,omitempty"`
}

type ReplyMetadata struct {
	Intent               string                 `json:"intent,omitempty"`
	ReasoningContent     string                 `json:"reasoning_content,omitempty"`
	AgentTrace           []AgentTrace           `json:"agent_trace,omitempty"`
	Workflow             []WorkflowStep         `json:"workflow,omitempty"`
	ToolCalls            []ToolCallRecord       `json:"tool_calls,omitempty"`
	SearchResults        []Source               `json:"search_results,omitempty"`
	SearchError          string                 `json:"search_error,omitempty"`
	RecipeCard           *RecipeCard            `json:"recipe_card,omitempty"`
	PendingApproval      *PendingApproval       `json:"pending_approval,omitempty"`
	Timeline             []TimelineEvent        `json:"timeline,omitempty"`
	KnowledgeIngestWatch []KnowledgeIngestWatch `json:"knowledge_ingest_watch,omitempty"`
}

type KnowledgeIngestWatch struct {
	AssetID string `json:"asset_id"`
	Name    string `json:"name,omitempty"`
}

type KnowledgeIngestActionResult struct {
	Action          string                `json:"action"`
	DocumentID      string                `json:"document_id,omitempty"`
	MediaAssetID    string                `json:"media_asset_id,omitempty"`
	Title           string                `json:"title,omitempty"`
	Status          string                `json:"status,omitempty"`
	ProcessingStage string                `json:"processing_stage,omitempty"`
	StageLabel      string                `json:"stage_label,omitempty"`
	Retryable       bool                  `json:"retryable,omitempty"`
	Partial         bool                  `json:"partial,omitempty"`
	Settled         bool                  `json:"settled,omitempty"`
	Summary         string                `json:"summary,omitempty"`
	FailureReason   string                `json:"failure_reason,omitempty"`
	Message         string                `json:"message,omitempty"`
	Watch           *KnowledgeIngestWatch `json:"watch,omitempty"`
}

type DraftIngredient struct {
	GroupName   string `json:"group_name"`
	Name        string `json:"name"`
	AmountText  string `json:"amount_text"`
	Preparation string `json:"preparation"`
}

type DraftStep struct {
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	StepType       string   `json:"step_type"`
	NeedTimer      bool     `json:"need_timer"`
	TimerSeconds   int      `json:"timer_seconds"`
	TimerAnimation string   `json:"timer_animation"`
	EndCondition   string   `json:"end_condition"`
	HeatLevel      string   `json:"heat_level,omitempty"`
	SafetyTips     string   `json:"safety_tips,omitempty"`
	AIHint         string   `json:"ai_hint,omitempty"`
	MediaURL       string   `json:"media_url,omitempty"`
	MediaURLs      []string `json:"media_urls,omitempty"`
}

type ImageRecipeDraftInput struct {
	TitleHint string       `json:"title_hint"`
	OCRText   string       `json:"ocr_text"`
	Images    []Attachment `json:"images"`
}

type ImageRecipeDraft struct {
	Title        string            `json:"title"`
	Summary      string            `json:"summary"`
	Category     string            `json:"category"`
	TotalMinutes int               `json:"total_minutes"`
	Difficulty   int               `json:"difficulty"`
	Tools        []string          `json:"tools"`
	Ingredients  []DraftIngredient `json:"ingredients"`
	Steps        []DraftStep       `json:"steps"`
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
	Flavor      string   `json:"flavor,omitempty"`
	Duration    string   `json:"duration,omitempty"`
	Difficulty  string   `json:"difficulty,omitempty"`
	Style       string   `json:"style,omitempty"`
	Constraints []string `json:"constraints,omitempty"`
}
