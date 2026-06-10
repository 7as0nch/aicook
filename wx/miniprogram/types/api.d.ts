// 后端业务实体的 TypeScript 类型定义
// 与 backend/api/aicook/v1/*.proto 对齐；后端用 protojson 序列化时数字字段以 string 形式返回（int64 防精度丢失），
// 前端统一以 string | number 兼容，必要处使用 String() 转换。
//
// 【迁移中】本文件为历史手写类型，权威类型由 `pnpm gen:types` 从 backend proto 自动生成到
// types/generated/（字段 snake_case、int64→string、Timestamp→string，与后端序列化行为一致）。
// 新代码请直接引用 types/generated/ 下的类型，不要再往本文件添加与 proto 对应的类型；
// 本文件存量类型随页面改造逐步迁移后删除。
//
// 【Int64Like 使用准则】后端 ID 是雪花算法 int64（已超出 JS Number 2^53 精度上限）：
//   1. 持有 ID 时永远当字符串用，进 URL/请求体前一律 String(id)，严禁 Number(id)；
//   2. 比较用 String(a) === String(b)，严禁参与算术运算；
//   3. protojson 对 int64 的请求体同时接受字符串与数字，发字符串永远安全。

export type Int64Like = string | number;

// 通用时间戳（后端 protojson 返回 RFC 3339 字符串）
export type Timestamp = string;

// === 用户 / 家庭 ===

export interface UserProfile {
  id: Int64Like;
  household_id: Int64Like;
  username: string;
  phone?: string;
  display_name: string;
  email?: string;
  status?: string;
  avatar_url?: string;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface HouseholdSummary {
  id: Int64Like;
  name: string;
  share_code?: string;
  timezone?: string;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface AuthReply {
  token: string;
  user: UserProfile;
  current_household: HouseholdSummary;
  households?: HouseholdSummary[];
}

export interface HouseholdMemberDetail {
  id: Int64Like;
  user_id: Int64Like;
  role: string;
  display_name: string;
  avatar_url?: string;
  emoji?: string;
  flavor_tags?: string[];
}

export interface KitchenTag {
  id: Int64Like;
  household_id: Int64Like;
  name: string;
  icon?: string;
  color?: string;
  type?: number;
}

export interface HouseholdPreferences {
  flavor: string[];
  scenarios: string[];
  restrictions: string[];
  max_difficulty: number;
  max_minutes: number;
}

// === 菜谱 ===

export interface Recipe {
  id: Int64Like;
  household_id: Int64Like;
  owner_user_id: Int64Like;
  source_household_id?: Int64Like;
  forked_from_recipe_id?: Int64Like;
  title: string;
  summary?: string;
  cover_image_url?: string;
  status: string;                    // 'draft' | 'published'
  source_type?: string;
  language?: string;
  category?: string;
  total_minutes?: number;
  difficulty?: number;
  scenario_tags?: string[];
  flavor_tags?: string[];
  tools?: string[];
  gallery_image_urls?: string[];
  metadata?: Record<string, unknown>;
  favored?: boolean;                   // 当前用户是否已收藏（后端在返回时 join 计算）
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface RecipeFavorite {
  id: Int64Like;
  household_id: Int64Like;
  user_id: Int64Like;
  recipe_id: Int64Like;
  recipe?: Recipe;                     // 后端按需返回嵌套
  created_at?: Timestamp;
}

export interface RecipeIngredient {
  id: Int64Like;
  recipe_id: Int64Like;
  sort_order: number;
  group_name?: string;
  name: string;
  amount_text?: string;
  preparation?: string;
  remark?: string;
}

export interface RecipeStep {
  id: Int64Like;
  recipe_id: Int64Like;
  step_no: number;
  title?: string;
  description: string;
  step_type?: string;
  need_timer?: boolean;
  timer_seconds?: number;
  timer_animation?: string;
  heat_level?: string;
  end_condition?: string;
  safety_tips?: string;
  ai_hint?: string;
  media_url?: string;
  media_urls?: string[];
}

export interface RecipeDetail {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export interface TodayRecipeReason {
  kind: string;
  label: string;
}

export interface TodayRecipe {
  recipe: Recipe;
  score: number;
  reasons: TodayRecipeReason[];
}

// === 周计划 / 购物清单 ===

// 周计划中某餐次的一道菜（对应 backend biz/kitchen.MealPlanDish）。
// 注意：days 经 protobuf Struct 传输，id/recipe_id 以字符串承载（雪花 ID 超出 double 精度）。
export interface MealPlanDish {
  id?: Int64Like;
  recipe_id?: Int64Like;
  recipe_title?: string;
  note?: string;
}

// 餐次 key 与 backend biz/kitchen.MealSlot 对齐
export type MealSlotKey = 'breakfast' | 'lunch' | 'dinner';

export interface MealPlanWeek {
  id: Int64Like;
  week_start_date: string;          // YYYY-MM-DD
  timezone?: string;
  source?: string;
  // 外层 key 为星期名 monday..sunday（不是日期串！），内层 key 为餐次
  days?: Record<string, Partial<Record<MealSlotKey, MealPlanDish[]>>>;
}

// 保存周计划时的单道菜输入（recipe_id 必须为字符串，防精度丢失）
export interface MealPlanDishInput {
  recipe_id?: string;
  recipe_title: string;
  note?: string;
}

// 整周 days 结构（key 为星期名 monday..sunday），保存与读取共用，对应 proto map<string, MealPlanDaySlots>
export type MealPlanDays = Record<string, Partial<Record<MealSlotKey, MealPlanDishInput[]>>>;

export interface ShoppingList {
  id: Int64Like;
  meal_plan_id?: Int64Like;
  week_start_date: string;
  status: string;                    // 'pending' | 'completed'
  completed_at?: Timestamp;
}

export interface ShoppingListItem {
  id: Int64Like;
  shopping_list_id: Int64Like;
  sort_order: number;
  source_type: string;
  source_recipe_id?: Int64Like;
  source_recipe_title?: string;
  ingredient_name: string;
  normalized_name?: string;
  category?: string;
  required_quantity_value?: number;
  required_unit?: string;
  required_text?: string;
  missing_quantity_value?: number;
  missing_text?: string;
  checked: boolean;
  note?: string;
}

// === 库存 ===

export interface InventoryItem {
  id: Int64Like;
  household_id: Int64Like;
  kind: string;
  name: string;
  normalized_name?: string;
  category?: string;
  quantity_value?: number;
  unit?: string;
  quantity_text?: string;
  source_type?: string;
  confidence?: number;
  status?: string;
  expires_at?: Timestamp;
  last_seen_at?: Timestamp;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface InventoryRecommendation {
  recipe: Recipe;
  match_count: number;
  ingredient_total: number;
  match_percent: number;
  matched_items: string[];
}

// === 烹饪进度与历史 ===

export interface ActiveCooking {
  recipe_id: Int64Like;
  title?: string;
  cover_image_url?: string;
  step_index: number;
  total_steps?: number;
  timer_total_seconds?: number;
  remaining_seconds?: number;
  updated_at_ms?: number;
  timer_running?: boolean;
}

export interface CookingHistoryEntry {
  id: Int64Like;
  household_id: Int64Like;
  user_id: Int64Like;
  recipe_id: Int64Like;
  recipe_title_snapshot: string;
  recipe_cover_snapshot?: string;
  started_at?: Timestamp;
  completed_at?: Timestamp;
  duration_seconds: number;
  completed_step_count: number;
  rating?: number;
  note?: string;
  created_at?: Timestamp;
}

// === AI 会话 / 消息 ===

export interface Attachment {
  type: string;
  url?: string;
  content_type?: string;
  name?: string;
  asset_id?: string;
}

export interface QuoteContext {
  selected_text?: string;
  selection_source?: string;
  surrounding_text?: string;
  scene?: string;
}

export interface Source {
  title: string;
  document_id?: string;
  snippet?: string;
}

export interface AISession {
  id: Int64Like;
  household_id: Int64Like;
  user_id: Int64Like;
  recipe_id?: Int64Like;
  scene?: string;
  title?: string;
  context?: Record<string, unknown>;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface AIMessage {
  id: Int64Like;
  ai_session_id: Int64Like;
  role: string;                      // 'user' | 'assistant' | 'system'
  content: string;
  mode?: string;
  quote_context?: QuoteContext;
  attachments?: Attachment[];
  response_sources?: Source[];
  response_meta?: Record<string, unknown>;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

// === 知识库 ===

export interface KnowledgeBase {
  id: Int64Like;
  household_id: Int64Like;
  name: string;
  description?: string;
  status: string;
  default_top_k?: number;
  default_chunk_size?: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDocument {
  id: Int64Like;
  knowledge_base_id: Int64Like;
  media_asset_id?: Int64Like;
  title: string;
  file_name?: string;
  content_type?: string;
  status: string;
  text_content?: string;
  summary?: string;
  processing_stage?: string;
  chunk_count?: number;
}

// === 媒体 ===

export interface MediaAsset {
  id: Int64Like;
  household_id?: Int64Like;
  user_id?: Int64Like;
  media_type?: string;
  file_name?: string;
  content_type?: string;
  size_bytes?: number;
  storage_url?: string;
  source?: string;
}

// === 导入任务 ===

export interface ImportJob {
  id: Int64Like;
  household_id: Int64Like;
  user_id: Int64Like;
  input_type: string;
  status: string;                    // 'pending' | 'running' | 'success' | 'failed'
  stage: string;
  recipe_id?: Int64Like;
  error_message?: string;
}

// === 菜谱分享 ===

export interface RecipeShareSummary {
  id: Int64Like;
  share_code: string;
  status: string;
  recipe_id: Int64Like;
  share_url?: string;
}
