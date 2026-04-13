package model

import (
	"time"

	"github.com/pgvector/pgvector-go"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/chengjiang/aicook/backend/internal/utils"
)

type BaseModel struct {
	ID        int64          `gorm:"type:bigint;primaryKey;autoIncrement:false" json:"id,string"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (b *BaseModel) BeforeCreate(_ *gorm.DB) error {
	if b.ID == 0 {
		b.ID = utils.GetSFID()
	}
	return nil
}

type Household struct {
	BaseModel
	Name string `gorm:"size:80;not null" json:"name"`
	// ShareCode 用于跨厨房分享菜谱导入；需要和 base.sql 保持唯一语义一致。
	ShareCode string `gorm:"size:32;uniqueIndex" json:"share_code"`
	Timezone  string `gorm:"size:64;default:'Asia/Shanghai'" json:"timezone"`
	// Preferences 对应 households.preferences，业务上按非空 JSON 对象使用。
	Preferences datatypes.JSONMap `gorm:"type:jsonb" json:"preferences"`
}

type User struct {
	BaseModel
	HouseholdID int64 `gorm:"type:bigint;not null;index" json:"household_id,string"`
	// Username 是登录账号，需要全局唯一。
	Username string `gorm:"size:60;not null;uniqueIndex" json:"username"`
	// PasswordHash 存储 bcrypt 哈希，不能保存明文密码。
	PasswordHash string `gorm:"size:255;not null" json:"-"`
	// Phone 先作为预留联系字段入库，手机号登录留待后续版本。
	Phone string `gorm:"size:32;default:'';index" json:"phone"`
	DisplayName string `gorm:"size:60;not null" json:"display_name"`
	Email       string `gorm:"size:120;uniqueIndex" json:"email"`
	Status      string `gorm:"size:20;default:'active'" json:"status"`
	// AvatarAssetID 指向 media_assets.id；空表示未设置头像。
	AvatarAssetID *int64 `gorm:"type:bigint;index" json:"avatar_asset_id,string,omitempty"`
}

// HouseholdMember 支持一个用户加入多个厨房，并为角色扩展预留空间。
type HouseholdMember struct {
	BaseModel
	HouseholdID int64  `gorm:"type:bigint;not null;uniqueIndex:idx_household_member,priority:1;index" json:"household_id,string"`
	UserID      int64  `gorm:"type:bigint;not null;uniqueIndex:idx_household_member,priority:2;index" json:"user_id,string"`
	Role        string `gorm:"size:20;not null;default:'member'" json:"role"`
}

// KitchenTag 用于区分不同厨房特色菜谱聚合，例如“家常菜”“快手菜”。
type KitchenTag struct {
	BaseModel
	HouseholdID int64  `gorm:"type:bigint;not null;uniqueIndex:idx_kitchen_tag_name,priority:1;index" json:"household_id,string"`
	Name        string `gorm:"size:60;not null;uniqueIndex:idx_kitchen_tag_name,priority:2" json:"name"`
	Icon        string `gorm:"size:16;default:''" json:"icon"`
	Color       string `gorm:"size:32;default:''" json:"color"`
	Type        uint8  `gorm:"default:2" json:"type"` // 1: 系统内置, 2: 用户自定义
}

// RecipeKitchenTag 维护菜谱与厨房标签的多对多关系，并区分主/次标签。
type RecipeKitchenTag struct {
	BaseModel
	RecipeID     int64  `gorm:"type:bigint;not null;uniqueIndex:idx_recipe_kitchen_tag,priority:1;index" json:"recipe_id,string"`
	KitchenTagID int64  `gorm:"type:bigint;not null;uniqueIndex:idx_recipe_kitchen_tag,priority:2;index" json:"kitchen_tag_id,string"`
	RelationType string `gorm:"size:20;not null;uniqueIndex:idx_recipe_kitchen_tag,priority:3;index" json:"relation_type"`
}

type MediaAsset struct {
	BaseModel
	HouseholdID  int64             `gorm:"type:bigint;not null;index" json:"household_id,string"`
	UserID       int64             `gorm:"type:bigint;not null;index" json:"user_id,string"`
	MediaType    string            `gorm:"size:20;not null;index" json:"media_type"`
	FileName     string            `gorm:"size:255;not null" json:"file_name"`
	ContentType  string            `gorm:"size:120;not null" json:"content_type"`
	SizeBytes    int64             `gorm:"default:0" json:"size_bytes"`
	Bucket       string            `gorm:"size:120;not null" json:"bucket"`
	ObjectKey    string            `gorm:"size:255;not null;uniqueIndex" json:"object_key"`
	StorageURL   string            `gorm:"size:255;not null" json:"storage_url"`
	Source       string            `gorm:"size:50;default:'upload'" json:"source"`
	MetadataJSON datatypes.JSONMap `gorm:"type:jsonb" json:"metadata_json"`
}

type Recipe struct {
	BaseModel
	HouseholdID    int64             `gorm:"type:bigint;not null;index" json:"household_id,string"`
	OwnerUserID    int64             `gorm:"type:bigint;not null;index" json:"owner_user_id,string"`
	SourceHouseholdID *int64         `gorm:"type:bigint;index" json:"source_household_id,string,omitempty"`
	ForkedFromRecipeID *int64        `gorm:"type:bigint;index" json:"forked_from_recipe_id,string,omitempty"`
	Title          string            `gorm:"size:120;not null;index" json:"title"`
	Summary        string            `gorm:"type:text" json:"summary"`
	CoverImageURL    string         `gorm:"type:text" json:"cover_image_url"`
	GalleryImageURLs datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"gallery_image_urls"`
	Status             string       `gorm:"size:20;default:'draft';index" json:"status"`
	SourceType     string            `gorm:"size:30;default:'manual';index" json:"source_type"`
	Language       string            `gorm:"size:12;default:'zh-CN'" json:"language"`
	Category       string            `gorm:"size:50;index" json:"category"`
	TotalMinutes   int               `gorm:"default:0" json:"total_minutes"`
	Difficulty     int               `gorm:"default:1" json:"difficulty"`
	ScenarioTags   datatypes.JSON    `gorm:"type:jsonb" json:"scenario_tags"`
	FlavorTags     datatypes.JSON    `gorm:"type:jsonb" json:"flavor_tags"`
	Tools          datatypes.JSON    `gorm:"type:jsonb" json:"tools"`
	MetadataJSON   datatypes.JSONMap `gorm:"type:jsonb" json:"metadata_json"`
}

type RecipeIngredient struct {
	BaseModel
	RecipeID     int64  `gorm:"type:bigint;not null;index:idx_recipe_ingredient_order,priority:1" json:"recipe_id,string"`
	SortOrder    int       `gorm:"not null;index:idx_recipe_ingredient_order,priority:2" json:"sort_order"`
	GroupName    string    `gorm:"size:50" json:"group_name"`
	Name         string    `gorm:"size:120;not null" json:"name"`
	AmountText   string    `gorm:"size:80" json:"amount_text"`
	Preparation  string    `gorm:"size:120" json:"preparation"`
	Remark       string    `gorm:"type:text" json:"remark"`
}

type RecipeStep struct {
	BaseModel
	RecipeID        int64  `gorm:"type:bigint;not null;index:idx_recipe_step_order,priority:1" json:"recipe_id,string"`
	StepNo          int       `gorm:"not null;index:idx_recipe_step_order,priority:2" json:"step_no"`
	Title           string    `gorm:"size:120" json:"title"`
	Description     string    `gorm:"type:text;not null" json:"description"`
	StepType        string    `gorm:"size:20;default:'cook'" json:"step_type"`
	NeedTimer       bool      `gorm:"default:false" json:"need_timer"`
	TimerSeconds    int       `gorm:"default:0" json:"timer_seconds"`
	TimerAnimation  string    `gorm:"size:30;default:'ring'" json:"timer_animation"`
	HeatLevel       string    `gorm:"size:30" json:"heat_level"`
	EndCondition    string    `gorm:"type:text" json:"end_condition"`
	SafetyTips      string    `gorm:"type:text" json:"safety_tips"`
	AIHint          string         `gorm:"type:text" json:"ai_hint"`
	MediaURL        string         `gorm:"type:text" json:"media_url"`
	MediaURLs       datatypes.JSON `gorm:"type:jsonb;column:media_urls;default:'[]'" json:"media_urls"`
}

type ImportJob struct {
	BaseModel
	HouseholdID       int64          `gorm:"type:bigint;not null;index" json:"household_id,string"`
	UserID            int64          `gorm:"type:bigint;not null;index" json:"user_id,string"`
	InputType         string         `gorm:"size:30;not null;index" json:"input_type"`
	Status            string         `gorm:"size:30;not null;index" json:"status"`
	Stage             string         `gorm:"size:50" json:"stage"`
	RecipeID          *int64         `gorm:"type:bigint;index" json:"recipe_id,string,omitempty"`
	InputPayload      datatypes.JSON `gorm:"type:jsonb" json:"input_payload"`
	NormalizedPayload datatypes.JSON `gorm:"type:jsonb" json:"normalized_payload"`
	ErrorMessage      string         `gorm:"type:text" json:"error_message"`
}

type KnowledgeBase struct {
	BaseModel
	HouseholdID      int64             `gorm:"type:bigint;not null;index" json:"household_id,string"`
	Name             string            `gorm:"size:120;not null;index" json:"name"`
	Description      string            `gorm:"type:text" json:"description"`
	Status           string            `gorm:"size:20;default:'active'" json:"status"`
	DefaultTopK      int               `gorm:"default:4" json:"default_top_k"`
	DefaultChunkSize int               `gorm:"default:1200" json:"default_chunk_size"`
	MetadataJSON     datatypes.JSONMap `gorm:"type:jsonb" json:"metadata_json"`
}

type KnowledgeDocument struct {
	BaseModel
	KnowledgeBaseID int64             `gorm:"type:bigint;not null;index" json:"knowledge_base_id,string"`
	MediaAssetID    *int64            `gorm:"type:bigint;index" json:"media_asset_id,string,omitempty"`
	Title           string            `gorm:"size:255;not null" json:"title"`
	FileName        string            `gorm:"size:255;not null" json:"file_name"`
	ContentType     string            `gorm:"size:120;not null" json:"content_type"`
	Bucket          string            `gorm:"size:120;not null" json:"bucket"`
	ObjectKey       string            `gorm:"size:255;not null" json:"object_key"`
	Status          string            `gorm:"size:30;default:'uploaded';index" json:"status"`
	ProcessingStage string            `gorm:"size:50;default:''" json:"processing_stage"`
	TextContent     string            `gorm:"type:text" json:"text_content"`
	Summary         string            `gorm:"type:text" json:"summary"`
	MetadataJSON    datatypes.JSONMap `gorm:"type:jsonb" json:"metadata_json"`
	ChunkCount      int               `gorm:"-" json:"chunk_count"`
}

type KnowledgeChunk struct {
	BaseModel
	KnowledgeBaseID int64             `gorm:"type:bigint;not null;index" json:"knowledge_base_id,string"`
	DocumentID      int64             `gorm:"type:bigint;not null;index" json:"document_id,string"`
	ChunkNo         int               `gorm:"not null;index" json:"chunk_no"`
	Content         string            `gorm:"type:text;not null" json:"content"`
	SourceSnippet   string            `gorm:"type:text" json:"source_snippet"`
	TokenSize       int               `gorm:"default:0" json:"token_size"`
	Embedding       *pgvector.Vector  `gorm:"type:vector" json:"-"`
	MetadataJSON    datatypes.JSONMap `gorm:"type:jsonb" json:"metadata_json"`
}

// HouseholdAIMemory 家庭级 AI 长期记忆（饮食偏好、禁忌等），供对话与知识检索注入。
type HouseholdAIMemory struct {
	BaseModel
	HouseholdID int64      `gorm:"type:bigint;not null;index" json:"household_id,string"`
	UserID      *int64     `gorm:"type:bigint;index" json:"user_id,string,omitempty"`
	Scope       string     `gorm:"size:40;not null;default:'general'" json:"scope"`
	Content     string     `gorm:"type:text;not null" json:"content"`
	Source      string     `gorm:"size:50;not null;default:'user_stated'" json:"source"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
}

// KnowledgeGraphEdge 简易知识图谱边（主体—谓词—客体），可按 household 过滤检索。
type KnowledgeGraphEdge struct {
	BaseModel
	HouseholdID  int64             `gorm:"type:bigint;not null;index" json:"household_id,string"`
	SubjectKind  string            `gorm:"size:40;not null" json:"subject_kind"`
	SubjectID    string            `gorm:"size:64;not null" json:"subject_id"`
	Predicate    string            `gorm:"size:80;not null" json:"predicate"`
	ObjectKind   string            `gorm:"size:40;not null" json:"object_kind"`
	ObjectID     string            `gorm:"size:64;not null" json:"object_id"`
	Weight       float64           `gorm:"default:1" json:"weight"`
	MetadataJSON datatypes.JSONMap `gorm:"type:jsonb" json:"metadata_json"`
}

type KnowledgeIndexJob struct {
	BaseModel
	KnowledgeBaseID int64  `gorm:"type:bigint;not null;index" json:"knowledge_base_id,string"`
	DocumentID      int64  `gorm:"type:bigint;not null;index" json:"document_id,string"`
	Status          string    `gorm:"size:30;not null;index" json:"status"`
	Stage           string    `gorm:"size:50" json:"stage"`
	ErrorMessage    string    `gorm:"type:text" json:"error_message"`
}

type AISession struct {
	BaseModel
	HouseholdID  int64             `gorm:"type:bigint;not null;index" json:"household_id,string"`
	UserID       int64             `gorm:"type:bigint;not null;index" json:"user_id,string"`
	RecipeID     *int64            `gorm:"type:bigint;index" json:"recipe_id,string,omitempty"`
	Scene        string            `gorm:"size:20;not null;index" json:"scene"`
	Title        string            `gorm:"size:120" json:"title"`
	ContextJSON  datatypes.JSONMap `gorm:"type:jsonb" json:"context_json"`
}

type AIMessage struct {
	BaseModel
	AISessionID      int64          `gorm:"type:bigint;not null;index" json:"ai_session_id,string"`
	Role             string         `gorm:"size:20;not null;index" json:"role"`
	Content          string         `gorm:"type:text;not null" json:"content"`
	Mode             string         `gorm:"size:20;default:'adk'" json:"mode"`
	QuoteContextJSON datatypes.JSON `gorm:"type:jsonb" json:"quote_context_json"`
	AttachmentsJSON  datatypes.JSON `gorm:"type:jsonb" json:"attachments_json"`
	ResponseMetaJSON datatypes.JSON `gorm:"type:jsonb" json:"response_meta_json"`
}
