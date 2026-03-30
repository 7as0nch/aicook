一、产品定义

你的产品核心不是“菜谱展示站”，而是一个家庭场景下的决策和执行工具。

我建议的产品闭环是：

沉淀菜谱
手动添加、从网页导入、从 HowToCook 批量导入、AI 搜索后导入。
解决“今天吃什么”
根据你的口味、家里现有食材、可用时间、最近吃过的菜，推荐 3~5 个候选。
解决“周末买什么”
做一周菜单，自动汇总购物清单。
解决“具体怎么做”
进入做菜模式，一步一步走，当前步骤全屏显示，带倒计时动画、火候提示、失败排查。
解决“不会的时候问 AI”
AI 知道你当前是哪一道菜、哪一步、前后文是什么，所以问“这个时候要不要盖锅盖”“炒到什么程度算熟”时，它能基于当前步骤回答，而不是泛泛地讲菜谱。
二、功能规划
1）MVP 先做这 6 块

菜谱库

手动新建/编辑菜谱
HowToCook 批量导入
粘贴网页 URL 导入
AI 搜索菜谱后导入草稿

首页推荐

今天吃什么
15 分钟快手菜
冰箱现有食材可做
最近没吃过但你会喜欢的

菜谱详情

封面图
标签、耗时、难度、份量
原料清单
步骤列表
来源信息
一键加入计划 / 开始做菜

做菜模式

每次只显示一个步骤
大号字体、适合厨房操作
倒计时环形动画 / 进度条动画
上一步 / 下一步
当前步骤提问 AI

一周菜单

按早餐 / 午餐 / 晚餐排
支持 AI 生成一周菜单初稿
支持手动替换菜谱

购物清单

按蔬菜、肉类、调料分组
自动汇总用量
勾选已买
支持从一周菜单一键生成
2）第二阶段再补
冰箱库存 / 保质期
语音播报步骤
家庭成员口味档案
营养估算
做菜记录与复盘
收藏夹 / 菜单夹
PWA 离线缓存
三、交互与页面设计
首页风格

可以参考美团外卖，但要“去交易化，保留高效率”。

把外卖首页那套结构映射成菜谱首页：

顶部搜索栏：搜索菜名、食材、口味、场景
分类宫格：家常菜、快手菜、早餐、减脂、汤粥、夜宵
卡片流：大图 + 菜名 + 耗时 + 难度 + 食材齐全度
推荐区块：今天吃什么、按现有食材、周末囤菜推荐
固定底部导航（移动端）：首页 / 菜谱 / 计划 / 购物 / 我的
菜谱详情页

布局建议：

顶部大图
标题、副标题、来源、标签
“总耗时 / 难度 / 份量 / 口味”
原料清单
步骤列表
底部悬浮按钮：加入本周菜单、开始做菜
做菜模式

这个页面是你的产品亮点，建议单独设计：

一屏只放一个步骤
当前步骤字号大，图片可选
倒计时使用圆环动画
下一步切换时做卡片滑动过渡
“我不会”“这个炒到什么程度”“现在要不要加水”这些快捷提问按钮放底部
手机端支持保持常亮、横屏模式、语音朗读
四、系统架构建议
总体原则

第一版不要拆微服务。
直接做成：

web：Vue3 + TS + Vite
api-server：Go 单体服务
worker：异步任务进程
postgresql：主数据库
object storage：图片、导入原文、封面缓存
redis：可选，用于队列、缓存、SSE 会话（没有也能先跑）
前端建议
Vue3 + TypeScript + Vite
Vue Router
Pinia
UnoCSS 或 Tailwind
移动端优先响应式
做成 PWA，这样厨房里网络差时，已打开过的菜谱还能继续看
后端模块建议

按领域拆包，不按技术拆包：

auth：登录、家庭空间
recipe：菜谱 CRUD、标签、详情
importer：URL 导入、HowToCook 导入、AI 搜索导入
planner：周计划
shopping：购物清单
pantry：库存与食材
cooking：做菜模式、步骤日志、计时状态
ai：推荐、对话、解析、问答
media：图片抓取、压缩、去重、存储
数据层建议
PostgreSQL 主存储
JSONB 存 tags / 口味 / 额外元数据
对 title + summary + search_text 做全文检索
后期再加 pgvector 做语义搜索
图片放 MinIO / S3，不放数据库
核心接口

第一版最重要的接口差不多这些：

POST /api/imports/url
POST /api/imports/search
POST /api/imports/howtocook/sync
GET /api/recipes
GET /api/recipes/:id
POST /api/recipes
PATCH /api/recipes/:id
POST /api/meal-plans/generate
POST /api/shopping-lists/from-meal-plan
POST /api/cooking-sessions
PATCH /api/cooking-sessions/:id/next-step
POST /api/ai/sessions/:id/messages
五、AI 设计
1）菜谱导入 Agent

输入有 3 类：

A. 粘贴 URL 导入
流程：
抓网页 -> 提取正文 -> 提取图片 -> LLM 结构化 -> 生成草稿 -> 人工确认后入库

B. 文本描述搜索导入
例如：
“帮我找适合晚饭的鸡腿菜谱，不要太辣，30 分钟内”

流程：
搜索候选 -> 抓取 3~5 个网页 -> 结构化摘要 -> 给用户选一个 -> 导入草稿

C. HowToCook 批量导入
流程：
读取 markdown -> 解析章节 -> 转 Recipe/Ingredient/Step -> 批量入库

这里强烈建议：AI 导入后的菜谱先进入 draft/review 状态，不要直接发布。
因为网页抽取非常容易把份量、步骤顺序、火候条件搞错。

2）晚饭推荐 Agent

输入：

用户口味偏好
家庭成员忌口
冰箱库存
今晚可用时间
最近 7 天吃过什么
当前季节/场景（工作日晚饭、周末大菜、减脂等）

输出：

推荐 3~5 道菜
推荐理由
缺什么食材
一键加入计划

一个简单评分公式就够用了：

推荐分 = 食材匹配度 * 0.35 + 口味匹配度 * 0.25 + 时间匹配度 * 0.20 + 最近未吃惩罚 * 0.10 + 难度匹配度 * 0.10

3）做菜问答 Agent

这个 Agent 不要做成普通聊天，要做成上下文绑定型问答。

上下文至少带：

当前 recipe_id
当前 step_no
当前步骤文案
上一步和下一步
当前计时器剩余时间
用户刚才的问题

这样回答才会像：

“这一步不用盖盖子，因为你现在是在收汁”
“再炒 40~60 秒，看到表面微焦就可以下一步”
“现在可以转中小火，避免糊底”
4）Eino 里建议拆成 3 条流

基于 Eino 的 Tool / ADK / Workflow 能力，你可以把 AI 层拆成：
ImportFlow、DinnerAdvisor、CookingAssistant。这些能力在官方文档里都有对应的 ChatModel、Tool、ADK、Workflow/Graph、Interrupt/Resume 入口，所以你的选型是成立的。

六、核心数据模型（Go struct，可直接拿去起项目）

下面这版我按 GORM + PostgreSQL + UUID 给你写，目标是“第一版够用、后面能扩”。

建议先执行：
CREATE EXTENSION IF NOT EXISTS pgcrypto;

package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type BaseModel struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

/********** enums **********/

type RecipeSourceType string

const (
	RecipeSourceManual    RecipeSourceType = "manual"
	RecipeSourceURL       RecipeSourceType = "url_import"
	RecipeSourceSearch    RecipeSourceType = "search_import"
	RecipeSourceHowToCook RecipeSourceType = "howtocook"
	RecipeSourceAIGen     RecipeSourceType = "ai_generated"
)

type RecipeStatus string

const (
	RecipeStatusDraft     RecipeStatus = "draft"
	RecipeStatusReview    RecipeStatus = "review"
	RecipeStatusPublished RecipeStatus = "published"
	RecipeStatusArchived  RecipeStatus = "archived"
)

type RecipeVisibility string

const (
	RecipeVisibilityPrivate   RecipeVisibility = "private"
	RecipeVisibilityHousehold RecipeVisibility = "household"
	RecipeVisibilityPublic    RecipeVisibility = "public"
)

type StepType string

const (
	StepTypePrep    StepType = "prep"    // 切、洗、腌
	StepTypeCook    StepType = "cook"    // 炒、煎、煮
	StepTypeWait    StepType = "wait"    // 等待/焖/蒸
	StepTypePlate   StepType = "plate"   // 装盘
	StepTypeTip     StepType = "tip"     // 提示
	StepTypeCleanup StepType = "cleanup" // 收尾
)

type MealSlot string

const (
	MealSlotBreakfast MealSlot = "breakfast"
	MealSlotLunch     MealSlot = "lunch"
	MealSlotDinner    MealSlot = "dinner"
	MealSlotSnack     MealSlot = "snack"
)

type ImportStatus string

const (
	ImportStatusPending       ImportStatus = "pending"
	ImportStatusFetching      ImportStatus = "fetching"
	ImportStatusExtracting    ImportStatus = "extracting"
	ImportStatusStructuring   ImportStatus = "structuring"
	ImportStatusReview        ImportStatus = "review_required"
	ImportStatusSucceeded     ImportStatus = "succeeded"
	ImportStatusFailed        ImportStatus = "failed"
)

type CookingSessionStatus string

const (
	CookingSessionPending   CookingSessionStatus = "pending"
	CookingSessionRunning   CookingSessionStatus = "running"
	CookingSessionPaused    CookingSessionStatus = "paused"
	CookingSessionCompleted CookingSessionStatus = "completed"
	CookingSessionAborted   CookingSessionStatus = "aborted"
)

type AIScene string

const (
	AISceneImport   AIScene = "import"
	AIScenePlanner  AIScene = "planner"
	AISceneCooking  AIScene = "cooking"
	AISceneDiscover AIScene = "discover"
)

/********** household / user **********/

type Household struct {
	BaseModel
	Name            string            `gorm:"size:80;not null" json:"name"`
	Timezone        string            `gorm:"size:64;default:'Asia/Shanghai'" json:"timezone"`
	DefaultServings int               `gorm:"default:2" json:"default_servings"`
	Preferences     datatypes.JSONMap `gorm:"type:jsonb" json:"preferences"` // 家庭级偏好、忌口、常用口味
}

type User struct {
	BaseModel
	HouseholdID   uuid.UUID `gorm:"type:uuid;not null;index" json:"household_id"`
	Email         string    `gorm:"size:120;uniqueIndex" json:"email"`
	PasswordHash  string    `gorm:"size:255" json:"-"`
	DisplayName   string    `gorm:"size:60;not null" json:"display_name"`
	AvatarURL     string    `gorm:"type:text" json:"avatar_url"`
	Role          string    `gorm:"size:20;default:'member'" json:"role"`   // owner/member
	Status        string    `gorm:"size:20;default:'active'" json:"status"` // active/disabled
	LastLoginAt   *time.Time `json:"last_login_at"`
}

type UserPreference struct {
	BaseModel
	UserID               uuid.UUID       `gorm:"type:uuid;not null;uniqueIndex" json:"user_id"`
	PreferredCuisines    datatypes.JSON  `gorm:"type:jsonb" json:"preferred_cuisines"`
	DislikedIngredients  datatypes.JSON  `gorm:"type:jsonb" json:"disliked_ingredients"`
	Allergies            datatypes.JSON  `gorm:"type:jsonb" json:"allergies"`
	FavoriteFlavors      datatypes.JSON  `gorm:"type:jsonb" json:"favorite_flavors"`
	MaxCookMinutes       int             `gorm:"default:30" json:"max_cook_minutes"`
	DefaultSpicyLevel    int             `gorm:"default:0" json:"default_spicy_level"` // 0~5
	DietaryFlags         datatypes.JSON  `gorm:"type:jsonb" json:"dietary_flags"`       // 减脂/低碳/高蛋白等
}

/********** ingredient / pantry **********/

type Ingredient struct {
	BaseModel
	Name         string           `gorm:"size:120;not null;uniqueIndex" json:"name"`
	Aliases      datatypes.JSON   `gorm:"type:jsonb" json:"aliases"`
	Category     string           `gorm:"size:50;index" json:"category"` // vegetable/meat/seafood/seasoning...
	DefaultUnit  string           `gorm:"size:20" json:"default_unit"`
	StorageType  string           `gorm:"size:30" json:"storage_type"` // room/fridge/freezer
	Metadata     datatypes.JSONMap `gorm:"type:jsonb" json:"metadata"`
}

type PantryItem struct {
	BaseModel
	HouseholdID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"household_id"`
	IngredientID     *uuid.UUID      `gorm:"type:uuid;index" json:"ingredient_id"`
	Name             string          `gorm:"size:120;not null;index" json:"name"` // 兜底，避免 ingredient 未标准化
	Quantity         float64         `gorm:"type:numeric(10,2);default:0" json:"quantity"`
	Unit             string          `gorm:"size:20" json:"unit"`
	StorageLocation  string          `gorm:"size:30;index" json:"storage_location"` // fridge/freezer/pantry
	PurchasedAt      *time.Time      `json:"purchased_at"`
	ExpiresAt        *time.Time      `gorm:"index" json:"expires_at"`
	ConsumePriority  int             `gorm:"default:0;index" json:"consume_priority"`
	Remark           string          `gorm:"type:text" json:"remark"`
}

/********** recipe **********/

type Recipe struct {
	BaseModel
	OwnerHouseholdID *uuid.UUID       `gorm:"type:uuid;index" json:"owner_household_id"` // nil 表示系统菜谱
	OwnerUserID      *uuid.UUID       `gorm:"type:uuid;index" json:"owner_user_id"`

	Title            string           `gorm:"size:120;not null;index" json:"title"`
	Slug             string           `gorm:"size:160;index" json:"slug"`
	Subtitle         string           `gorm:"size:255" json:"subtitle"`
	Summary          string           `gorm:"type:text" json:"summary"`
	CoverImageURL    string           `gorm:"type:text" json:"cover_image_url"`

	Status           RecipeStatus     `gorm:"size:20;default:'draft';index" json:"status"`
	Visibility       RecipeVisibility `gorm:"size:20;default:'private';index" json:"visibility"`
	SourceType       RecipeSourceType `gorm:"size:30;default:'manual';index" json:"source_type"`

	Language         string           `gorm:"size:12;default:'zh-CN'" json:"language"`
	Category         string           `gorm:"size:50;index" json:"category"` // 家常菜/早餐/快手菜/汤粥
	Cuisine          string           `gorm:"size:50;index" json:"cuisine"`  // 川菜/粤菜/日式...
	Difficulty       int              `gorm:"default:1;index" json:"difficulty"` // 1~5
	SpicyLevel       int              `gorm:"default:0" json:"spicy_level"`      // 0~5
	PrepMinutes      int              `gorm:"default:0" json:"prep_minutes"`
	CookMinutes      int              `gorm:"default:0" json:"cook_minutes"`
	TotalMinutes     int              `gorm:"default:0;index" json:"total_minutes"`
	Servings         int              `gorm:"default:2" json:"servings"`

	ScenarioTags     datatypes.JSON   `gorm:"type:jsonb" json:"scenario_tags"` // 下饭/减脂/快手/适合晚饭
	FlavorTags       datatypes.JSON   `gorm:"type:jsonb" json:"flavor_tags"`   // 酸/甜/麻/辣/鲜
	DietaryFlags     datatypes.JSON   `gorm:"type:jsonb" json:"dietary_flags"` // 高蛋白/低脂/素食
	Tools            datatypes.JSON   `gorm:"type:jsonb" json:"tools"`         // 空气炸锅/电饭煲/炒锅

	Tips             string           `gorm:"type:text" json:"tips"`
	SourceNote       string           `gorm:"type:text" json:"source_note"`
	SearchText       string           `gorm:"type:text" json:"search_text"` // 用于全文检索
	EmbeddingStatus  string           `gorm:"size:20;default:'pending'" json:"embedding_status"`
	Version          int              `gorm:"default:1" json:"version"`

	NutritionJSON    datatypes.JSON   `gorm:"type:jsonb" json:"nutrition_json"`
	Metadata         datatypes.JSONMap `gorm:"type:jsonb" json:"metadata"`
}

type RecipeSource struct {
	BaseModel
	RecipeID          uuid.UUID       `gorm:"type:uuid;not null;index" json:"recipe_id"`
	SourceType        RecipeSourceType `gorm:"size:30;not null;index" json:"source_type"`
	SourceSite        string          `gorm:"size:120;index" json:"source_site"`
	SourceTitle       string          `gorm:"size:255" json:"source_title"`
	SourceURL         string          `gorm:"type:text" json:"source_url"`
	SourceAuthor      string          `gorm:"size:120" json:"source_author"`
	SourceLicense     string          `gorm:"size:120" json:"source_license"`
	SourceContentHash string          `gorm:"size:64;index" json:"source_content_hash"`
	CoverImageURL     string          `gorm:"type:text" json:"cover_image_url"`
	ImportedByUserID  *uuid.UUID      `gorm:"type:uuid;index" json:"imported_by_user_id"`
	ImportedAt        *time.Time      `json:"imported_at"`
	RawPayload        datatypes.JSON  `gorm:"type:jsonb" json:"raw_payload"` // 体量太大时可以转 OSS
}

type RecipeIngredient struct {
	BaseModel
	RecipeID        uuid.UUID  `gorm:"type:uuid;not null;index:idx_recipe_ingredient_order,priority:1" json:"recipe_id"`
	IngredientID    *uuid.UUID `gorm:"type:uuid;index" json:"ingredient_id"`

	SortOrder       int        `gorm:"not null;index:idx_recipe_ingredient_order,priority:2" json:"sort_order"`
	GroupName       string     `gorm:"size:50" json:"group_name"` // 主料/辅料/腌料/调味
	Name            string     `gorm:"size:120;not null;index" json:"name"`

	AmountMin       float64    `gorm:"type:numeric(10,2);default:0" json:"amount_min"`
	AmountMax       float64    `gorm:"type:numeric(10,2);default:0" json:"amount_max"`
	Unit            string     `gorm:"size:20" json:"unit"`
	AmountText      string     `gorm:"size:80" json:"amount_text"` // e.g. "10-15ml" / "2 个"
	IsOptional      bool       `gorm:"default:false" json:"is_optional"`
	Preparation     string     `gorm:"size:120" json:"preparation"` // 切丝/去皮/焯水
	Remark          string     `gorm:"type:text" json:"remark"`
}

type RecipeStep struct {
	BaseModel
	RecipeID          uuid.UUID   `gorm:"type:uuid;not null;index:idx_recipe_step_order,priority:1" json:"recipe_id"`
	StepNo            int         `gorm:"not null;index:idx_recipe_step_order,priority:2" json:"step_no"`

	Title             string      `gorm:"size:120" json:"title"`
	Description       string      `gorm:"type:text;not null" json:"description"`
	StepType          StepType    `gorm:"size:20;default:'cook';index" json:"step_type"`

	NeedTimer         bool        `gorm:"default:false" json:"need_timer"`
	TimerSeconds      int         `gorm:"default:0" json:"timer_seconds"`
	TimerAnimation    string      `gorm:"size:30;default:'ring'" json:"timer_animation"` // ring/bar/steam

	HeatLevel         string      `gorm:"size:30" json:"heat_level"`       // 大火/中火/小火
	TemperatureText   string      `gorm:"size:50" json:"temperature_text"` // 180C / 油温七成热
	StartCondition    string      `gorm:"type:text" json:"start_condition"`
	EndCondition      string      `gorm:"type:text" json:"end_condition"`   // 炒到微焦/汤汁收浓
	SafetyTips        string      `gorm:"type:text" json:"safety_tips"`
	AIHint            string      `gorm:"type:text" json:"ai_hint"`         // 给做菜问答的隐藏提示
	MediaURL          string      `gorm:"type:text" json:"media_url"`       // 步骤图/GIF
}

type RecipeMedia struct {
	BaseModel
	RecipeID        uuid.UUID `gorm:"type:uuid;not null;index" json:"recipe_id"`
	MediaType       string    `gorm:"size:20;index" json:"media_type"` // image/video/gif
	URL             string    `gorm:"type:text;not null" json:"url"`
	Width           int       `json:"width"`
	Height          int       `json:"height"`
	SortOrder       int       `gorm:"default:0" json:"sort_order"`
	AltText         string    `gorm:"size:255" json:"alt_text"`
	SourceURL       string    `gorm:"type:text" json:"source_url"`
}

/********** favorites / plan / shopping **********/

type FavoriteRecipe struct {
	BaseModel
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uidx_user_recipe_fav,priority:1" json:"user_id"`
	RecipeID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uidx_user_recipe_fav,priority:2" json:"recipe_id"`
}

type MealPlan struct {
	BaseModel
	HouseholdID         uuid.UUID      `gorm:"type:uuid;not null;index" json:"household_id"`
	Title               string         `gorm:"size:120;not null" json:"title"`
	StartDate           time.Time      `gorm:"type:date;not null;index" json:"start_date"`
	EndDate             time.Time      `gorm:"type:date;not null;index" json:"end_date"`
	Status              string         `gorm:"size:20;default:'draft';index" json:"status"` // draft/active/completed
	GeneratedBy         string         `gorm:"size:20;default:'manual'" json:"generated_by"` // manual/ai
	PreferenceSnapshot  datatypes.JSON `gorm:"type:jsonb" json:"preference_snapshot"`
	Remark              string         `gorm:"type:text" json:"remark"`
}

type MealPlanItem struct {
	BaseModel
	MealPlanID   uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:uidx_plan_date_slot,priority:1" json:"meal_plan_id"`
	PlanDate     time.Time  `gorm:"type:date;not null;uniqueIndex:uidx_plan_date_slot,priority:2;index" json:"plan_date"`
	MealSlot     MealSlot   `gorm:"size:20;not null;uniqueIndex:uidx_plan_date_slot,priority:3" json:"meal_slot"`

	RecipeID     *uuid.UUID `gorm:"type:uuid;index" json:"recipe_id"`
	CustomTitle  string     `gorm:"size:120" json:"custom_title"`
	Servings     int        `gorm:"default:2" json:"servings"`
	Remark       string     `gorm:"type:text" json:"remark"`
}

type ShoppingList struct {
	BaseModel
	HouseholdID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"household_id"`
	MealPlanID   *uuid.UUID `gorm:"type:uuid;index" json:"meal_plan_id"`
	Title        string     `gorm:"size:120;not null" json:"title"`
	Status       string     `gorm:"size:20;default:'open';index" json:"status"` // open/completed/archived
	GeneratedBy  string     `gorm:"size:20;default:'manual'" json:"generated_by"`
}

type ShoppingListItem struct {
	BaseModel
	ShoppingListID uuid.UUID      `gorm:"type:uuid;not null;index:idx_shopping_item_list_order,priority:1" json:"shopping_list_id"`
	SortOrder      int            `gorm:"default:0;index:idx_shopping_item_list_order,priority:2" json:"sort_order"`

	IngredientID   *uuid.UUID     `gorm:"type:uuid;index" json:"ingredient_id"`
	Name           string         `gorm:"size:120;not null;index" json:"name"`
	Category       string         `gorm:"size:50;index" json:"category"`
	AmountTotal    float64        `gorm:"type:numeric(10,2);default:0" json:"amount_total"`
	Unit           string         `gorm:"size:20" json:"unit"`
	AmountText     string         `gorm:"size:80" json:"amount_text"` // 兜底展示
	Purchased      bool           `gorm:"default:false;index" json:"purchased"`
	FromRecipeIDs  datatypes.JSON `gorm:"type:jsonb" json:"from_recipe_ids"`
	Remark         string         `gorm:"type:text" json:"remark"`
}

/********** cooking **********/

type CookingSession struct {
	BaseModel
	HouseholdID        uuid.UUID             `gorm:"type:uuid;not null;index" json:"household_id"`
	UserID             uuid.UUID             `gorm:"type:uuid;not null;index" json:"user_id"`
	RecipeID           uuid.UUID             `gorm:"type:uuid;not null;index" json:"recipe_id"`

	Status             CookingSessionStatus  `gorm:"size:20;default:'pending';index" json:"status"`
	Servings           int                   `gorm:"default:2" json:"servings"`
	CurrentStepNo      int                   `gorm:"default:1" json:"current_step_no"`
	StartedAt          *time.Time            `json:"started_at"`
	CompletedAt        *time.Time            `json:"completed_at"`

	TimerStateJSON     datatypes.JSON        `gorm:"type:jsonb" json:"timer_state_json"` // 当前倒计时状态
	DeviceType         string                `gorm:"size:20" json:"device_type"`          // mobile/pc/tablet
}

type CookingStepLog struct {
	BaseModel
	CookingSessionID     uuid.UUID   `gorm:"type:uuid;not null;index:idx_session_step,priority:1" json:"cooking_session_id"`
	RecipeStepID         uuid.UUID   `gorm:"type:uuid;not null;index" json:"recipe_step_id"`
	StepNo               int         `gorm:"not null;index:idx_session_step,priority:2" json:"step_no"`

	StartedAt            *time.Time  `json:"started_at"`
	CompletedAt          *time.Time  `json:"completed_at"`
	PlannedTimerSeconds  int         `gorm:"default:0" json:"planned_timer_seconds"`
	ActualDurationSec    int         `gorm:"default:0" json:"actual_duration_sec"`
	Skipped              bool        `gorm:"default:false" json:"skipped"`
	QuestionCount        int         `gorm:"default:0" json:"question_count"`
	Remark               string      `gorm:"type:text" json:"remark"`
}

/********** AI **********/

type AISession struct {
	BaseModel
	HouseholdID       uuid.UUID      `gorm:"type:uuid;not null;index" json:"household_id"`
	UserID            uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	RecipeID          *uuid.UUID     `gorm:"type:uuid;index" json:"recipe_id"`
	CookingSessionID  *uuid.UUID     `gorm:"type:uuid;index" json:"cooking_session_id"`

	Scene             AIScene        `gorm:"size:20;not null;index" json:"scene"`
	Title             string         `gorm:"size:120" json:"title"`
	ContextJSON       datatypes.JSON `gorm:"type:jsonb" json:"context_json"` // 当前菜谱、当前步骤、计划条件等
	LastMessageAt     *time.Time     `gorm:"index" json:"last_message_at"`
}

type AIMessage struct {
	BaseModel
	AISessionID       uuid.UUID      `gorm:"type:uuid;not null;index" json:"ai_session_id"`
	Role              string         `gorm:"size:20;not null;index" json:"role"` // system/user/assistant/tool
	Content           string         `gorm:"type:text;not null" json:"content"`

	StepNo            *int           `json:"step_no"`
	ToolName          string         `gorm:"size:80" json:"tool_name"`
	ToolInput         datatypes.JSON `gorm:"type:jsonb" json:"tool_input"`
	ToolOutput        datatypes.JSON `gorm:"type:jsonb" json:"tool_output"`

	ModelName         string         `gorm:"size:80" json:"model_name"`
	PromptTokens      int            `gorm:"default:0" json:"prompt_tokens"`
	CompletionTokens  int            `gorm:"default:0" json:"completion_tokens"`
	LatencyMs         int            `gorm:"default:0" json:"latency_ms"`
}

/********** import job **********/

type ImportJob struct {
	BaseModel
	HouseholdID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"household_id"`
	UserID             uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`

	InputType          string         `gorm:"size:30;not null;index" json:"input_type"` // url/search/howtocook
	InputQuery         string         `gorm:"type:text" json:"input_query"`
	InputURL           string         `gorm:"type:text" json:"input_url"`

	Status             ImportStatus   `gorm:"size:30;not null;index" json:"status"`
	Stage              string         `gorm:"size:50" json:"stage"` // fetching/extracting/...
	RecipeID           *uuid.UUID     `gorm:"type:uuid;index" json:"recipe_id"`

	ErrorMessage       string         `gorm:"type:text" json:"error_message"`
	CandidateSources   datatypes.JSON `gorm:"type:jsonb" json:"candidate_sources"` // 搜索候选
	RawPayload         datatypes.JSON `gorm:"type:jsonb" json:"raw_payload"`
	NormalizedPayload  datatypes.JSON `gorm:"type:jsonb" json:"normalized_payload"`

	StartedAt          *time.Time     `json:"started_at"`
	FinishedAt         *time.Time     `json:"finished_at"`
}
建表顺序
db.AutoMigrate(
	&Household{},
	&User{},
	&UserPreference{},
	&Ingredient{},
	&PantryItem{},
	&Recipe{},
	&RecipeSource{},
	&RecipeIngredient{},
	&RecipeStep{},
	&RecipeMedia{},
	&FavoriteRecipe{},
	&MealPlan{},
	&MealPlanItem{},
	&ShoppingList{},
	&ShoppingListItem{},
	&CookingSession{},
	&CookingStepLog{},
	&AISession{},
	&AIMessage{},
	&ImportJob{},
)
七、几个关键实现点
1）HowToCook 导入器怎么写

最值得先做的导入器就是 HowToCook。

建议做法：

拉取仓库固定 commit
遍历 dishes/**.md
解析标题、图片、原料、操作步骤
把“操作”里的 bullet list 转成 RecipeStep
遇到“等待 15 - 20 分钟”这类语句时，写入 timer_seconds
遇到“炒到变软”“外观呈粘稠状态”这类语句时，写入 end_condition

HowToCook 模板本身就鼓励写清楚原料、计算、操作，以及等待时间或结束判断，所以它非常适合被程序化解析。

2）倒计时动画怎么做

后端只存：

need_timer
timer_seconds
timer_animation
end_condition

前端渲染时：

ring：圆环倒计时
bar：横向进度条
steam：蒸煮类可以做呼吸感动画

同时要注意：做菜很多步骤不能只靠时间，所以 timer 是辅助，end_condition 才是兜底。

3）网页导入不要直接入正式库

最稳妥的流程是：

导入 -> 生成草稿 -> 预览页人工确认 -> 发布

预览页重点给用户确认：

标题
封面图
原料数量
步骤顺序
定时器是否正确
来源是否正确
4）搜索设计

第一版别上太重：

Postgres 全文搜索
分类过滤
标签过滤
按耗时、难度、是否缺食材排序

后面再加向量搜索，处理“我想吃点热乎的、带汤的、晚上不想太油”这种模糊查询。

八、最推荐的开发顺序

按照性价比排序：

第 1 阶段

用户/家庭空间
菜谱 CRUD
HowToCook 导入
菜谱详情页

第 2 阶段

做菜模式
步骤倒计时
CookingSession
当前步骤 AI 问答

第 3 阶段

一周菜单
购物清单生成
首页“今天吃什么”

第 4 阶段

URL 导入
AI 搜索导入
冰箱库存联动推荐

这套方案的核心价值在于：不是做一个“菜谱内容站”，而是做一个“家庭吃饭决策系统”。这会让你的产品比普通 recipe app 更有使用频率，因为它覆盖了“想吃什么、要买什么、怎么做、做的时候怎么问”这四个真正高频的问题。

下一步最适合继续展开的是：把这套模型继续细化成 数据库建表 SQL、Go 项目目录结构、以及 REST API 请求/响应 DTO。