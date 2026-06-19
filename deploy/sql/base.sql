-- AICook 完整建表脚本（雪花 BIGINT 主键，单文件全量 schema）
-- ============================================================================
-- 说明：
--   本文件是「全新安装」用的唯一完整脚本，已把历史的 migrate_*/alter_*/seed_*
--   全部合并进来。需要重建库时直接整段执行即可，无需再按顺序跑多个迁移文件。
--   * 故意不使用任何数据库级外键（FOREIGN KEY）：表关联仅靠业务 ID 逻辑维护，
--     方便后续随时改表 / 删表 / 重建，不被外键依赖顺序卡住。
--   * 关联完整性、软删除（deleted_at）由后端业务层保证。
--   * 认证、分享码、成员关系、标签相关的唯一性以本 SQL 为准；后端 GORM AutoMigrate
--     只做字段级非破坏性补齐，不再额外手写业务索引修补。
--   * 末尾「种子数据」分两段：系统内置标签为必需，演示数据可整段删除。
-- 前置：执行账号需有创建扩展与 schema 的权限。
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS aicook;
SET search_path TO aicook, public;

-- ============================================================================
-- 1. 账号 / 家庭 / 成员
-- ============================================================================

CREATE TABLE IF NOT EXISTS households (
  id BIGINT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  -- 厨房分享码：用于其他用户快速预览并导入当前厨房菜谱。
  share_code VARCHAR(32) UNIQUE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  -- 用户名唯一，用于当前版本登录注册。
  username VARCHAR(60) NOT NULL UNIQUE,
  -- 存储 bcrypt 哈希后的密码，禁止保存明文。
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  -- 手机号字段先入库预留，后续版本再扩展手机号登录。
  phone VARCHAR(32) DEFAULT '',
  display_name VARCHAR(60) NOT NULL,
  -- 用户头像，逻辑关联 media_assets.id（不使用 DB 级外键以免初始化顺序问题）。
  avatar_asset_id BIGINT,
  -- 外部头像直链，主要给微信一键登录拿到的 avatar_url 兜底；优先级低于 avatar_asset_id。
  avatar_url VARCHAR(512) NOT NULL DEFAULT '',
  email VARCHAR(120) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- 微信小程序登录字段：openid 唯一定位用户，unionid 跨小程序/公众号关联，均可空。
  wx_openid VARCHAR(64),
  wx_unionid VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS household_members (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  -- user_id > 0 绑定真实账号；user_id = 0 表示「虚拟成员」（家人但无微信账号）。
  user_id BIGINT NOT NULL,
  -- owner/member 等角色，便于后续扩展多厨房成员权限。
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  -- 虚拟成员的展示名 / 头像 emoji；真实账号留空，由 users 表决定。
  display_name VARCHAR(60) NOT NULL DEFAULT '',
  emoji VARCHAR(8) NOT NULL DEFAULT '',
  -- 成员个人口味偏好（与 household-level 解耦），结构对应 biz/user.HouseholdPreferences。
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
  -- 唯一性见下方 idx_household_members_real_user：只对真实账号去重，允许多个虚拟成员。
);

CREATE TABLE IF NOT EXISTS kitchen_tags (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  -- 厨房标签用于聚合某个厨房的特色菜谱分类。
  name VARCHAR(60) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '',
  color VARCHAR(32) NOT NULL DEFAULT '',
  -- type：1 系统内置（household_id=0，全局可见不可删），2 用户自定义。
  type SMALLINT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (household_id, name)
);

-- ============================================================================
-- 2. 媒体 / 菜谱
-- ============================================================================

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  media_type VARCHAR(20) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  bucket VARCHAR(120) NOT NULL,
  object_key VARCHAR(255) NOT NULL UNIQUE,
  storage_url VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'upload',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recipes (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  owner_user_id BIGINT NOT NULL,
  source_household_id BIGINT,
  forked_from_recipe_id BIGINT,
  title VARCHAR(120) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  -- 封面图集（多图，可含 <=10s 短视频）；长视频走 video_url。
  gallery_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_url TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  language VARCHAR(12) NOT NULL DEFAULT 'zh-CN',
  category VARCHAR(50) NOT NULL DEFAULT '',
  total_minutes INT NOT NULL DEFAULT 0,
  difficulty INT NOT NULL DEFAULT 1,
  scenario_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  flavor_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recipe_kitchen_tags (
  id BIGINT PRIMARY KEY,
  recipe_id BIGINT NOT NULL,
  kitchen_tag_id BIGINT NOT NULL,
  -- primary: category 主标签；secondary: scenario_tags 次标签。
  relation_type VARCHAR(20) NOT NULL DEFAULT 'secondary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (recipe_id, kitchen_tag_id, relation_type)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id BIGINT PRIMARY KEY,
  recipe_id BIGINT NOT NULL,
  sort_order INT NOT NULL,
  group_name VARCHAR(50) NOT NULL DEFAULT '',
  name VARCHAR(120) NOT NULL,
  amount_text VARCHAR(80) NOT NULL DEFAULT '',
  preparation VARCHAR(120) NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id BIGINT PRIMARY KEY,
  recipe_id BIGINT NOT NULL,
  step_no INT NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  step_type VARCHAR(20) NOT NULL DEFAULT 'cook',
  need_timer BOOLEAN NOT NULL DEFAULT FALSE,
  timer_seconds INT NOT NULL DEFAULT 0,
  timer_animation VARCHAR(30) NOT NULL DEFAULT 'ring',
  heat_level VARCHAR(30) NOT NULL DEFAULT '',
  end_condition TEXT NOT NULL DEFAULT '',
  safety_tips TEXT NOT NULL DEFAULT '',
  ai_hint TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  -- 步骤多图；单图旧字段 media_url 仍保留兼容。
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recipe_shares (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  recipe_id BIGINT NOT NULL,
  owner_user_id BIGINT NOT NULL,
  share_code VARCHAR(32) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_viewed_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (household_id, recipe_id)
);

-- 收藏菜谱：一个用户对同一菜谱只允许一条有效收藏（见下方 partial unique）。
CREATE TABLE IF NOT EXISTS recipe_favorites (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  recipe_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 3. 导入任务
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  input_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT '',
  recipe_id BIGINT,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 4. 知识库 / 知识图谱 / AI 记忆
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  default_top_k INT NOT NULL DEFAULT 4,
  default_chunk_size INT NOT NULL DEFAULT 1200,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id BIGINT PRIMARY KEY,
  knowledge_base_id BIGINT NOT NULL,
  media_asset_id BIGINT,
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  bucket VARCHAR(120) NOT NULL,
  object_key VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  processing_stage VARCHAR(50) NOT NULL DEFAULT '',
  text_content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGINT PRIMARY KEY,
  knowledge_base_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  chunk_no INT NOT NULL,
  content TEXT NOT NULL,
  source_snippet TEXT NOT NULL DEFAULT '',
  token_size INT NOT NULL DEFAULT 0,
  -- 不限定维度，兼容不同 embedding 模型（如豆包 2048 维）。
  embedding VECTOR,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_index_jobs (
  id BIGINT PRIMARY KEY,
  knowledge_base_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS household_ai_memories (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT,
  scope VARCHAR(40) NOT NULL DEFAULT 'general',
  content TEXT NOT NULL DEFAULT '',
  source VARCHAR(50) NOT NULL DEFAULT 'user_stated',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  subject_kind VARCHAR(40) NOT NULL DEFAULT '',
  subject_id VARCHAR(64) NOT NULL DEFAULT '',
  predicate VARCHAR(80) NOT NULL DEFAULT '',
  object_kind VARCHAR(40) NOT NULL DEFAULT '',
  object_id VARCHAR(64) NOT NULL DEFAULT '',
  weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 5. AI 会话 / 消息
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_sessions (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  recipe_id BIGINT,
  scene VARCHAR(20) NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id BIGINT PRIMARY KEY,
  ai_session_id BIGINT NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'adk',
  quote_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 6. 周计划 / 购物清单 / 库存
-- ============================================================================

CREATE TABLE IF NOT EXISTS meal_plans (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  week_start_date DATE NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  source VARCHAR(30) NOT NULL DEFAULT 'manual',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (household_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  meal_plan_id BIGINT NOT NULL,
  plan_date DATE NOT NULL,
  meal_slot VARCHAR(20) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  recipe_id BIGINT,
  recipe_title_snapshot VARCHAR(160) NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  meal_plan_id BIGINT,
  week_start_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  completed_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (household_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  shopping_list_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  source_type VARCHAR(30) NOT NULL DEFAULT 'plan_gap',
  source_recipe_id BIGINT,
  source_recipe_title VARCHAR(160) NOT NULL DEFAULT '',
  ingredient_name VARCHAR(120) NOT NULL,
  normalized_name VARCHAR(120) NOT NULL DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT '',
  required_quantity_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  required_unit VARCHAR(30) NOT NULL DEFAULT '',
  required_text VARCHAR(120) NOT NULL DEFAULT '',
  missing_quantity_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  missing_text VARCHAR(120) NOT NULL DEFAULT '',
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'ingredient',
  name VARCHAR(120) NOT NULL,
  normalized_name VARCHAR(120) NOT NULL DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT '',
  quantity_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  quantity_text VARCHAR(80) NOT NULL DEFAULT '',
  source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 7. 烹饪历史（不可变事实，供「最近做过」与推荐降权）
-- ============================================================================

CREATE TABLE IF NOT EXISTS cooking_history (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  recipe_id BIGINT NOT NULL,
  recipe_title_snapshot VARCHAR(160) NOT NULL DEFAULT '',
  recipe_cover_snapshot TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  completed_step_count INT NOT NULL DEFAULT 0,
  rating SMALLINT NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 8. 索引
-- ============================================================================

-- 账号 / 家庭 / 成员
CREATE INDEX IF NOT EXISTS idx_users_household_id ON users(household_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_avatar_asset_id ON users(avatar_asset_id);
-- 微信 openid 仅对非空值唯一；空字符串/NULL 允许重复（普通账号）。
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wx_openid ON users(wx_openid) WHERE wx_openid IS NOT NULL AND wx_openid <> '';
CREATE INDEX IF NOT EXISTS idx_users_wx_unionid ON users(wx_unionid) WHERE wx_unionid IS NOT NULL AND wx_unionid <> '';
-- share_code 已由 UNIQUE 约束隐式建唯一索引，不再重复。
-- household_members：user_id 单列索引便于按用户查其所属厨房列表。
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
-- 只对真实账号（user_id>0）去重，允许同一厨房挂多个 user_id=0 的虚拟成员。
CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_real_user
  ON household_members (household_id, user_id)
  WHERE user_id > 0 AND deleted_at IS NULL;
-- preferences 检索（推荐过滤按 flavor / restrictions key 匹配）。
CREATE INDEX IF NOT EXISTS idx_household_members_preferences
  ON household_members USING GIN (preferences);
CREATE INDEX IF NOT EXISTS idx_kitchen_tags_household_id ON kitchen_tags(household_id);

-- 媒体 / 菜谱
CREATE INDEX IF NOT EXISTS idx_media_assets_household_id ON media_assets(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_household_id ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchen_tags_recipe_id ON recipe_kitchen_tags(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchen_tags_kitchen_tag_id ON recipe_kitchen_tags(kitchen_tag_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchen_tags_relation_type ON recipe_kitchen_tags(relation_type);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_sort ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_step_no ON recipe_steps(recipe_id, step_no);
CREATE INDEX IF NOT EXISTS idx_recipe_shares_code_status ON recipe_shares(share_code, status);
CREATE INDEX IF NOT EXISTS idx_recipes_title_tsv ON recipes USING GIN (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, ''))
);

-- 收藏（均限定 deleted_at IS NULL，软删除不占唯一）
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_favorites_user_recipe
  ON recipe_favorites (household_id, user_id, recipe_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_favorites_user
  ON recipe_favorites (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_favorites_household
  ON recipe_favorites (household_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_favorites_recipe
  ON recipe_favorites (recipe_id)
  WHERE deleted_at IS NULL;

-- 导入任务
CREATE INDEX IF NOT EXISTS idx_import_jobs_input_type ON import_jobs(input_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

-- 知识库 / 图谱 / 记忆
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_household_id ON knowledge_bases(household_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_base_id ON knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_base_id ON knowledge_chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_household_ai_memories_household_id ON household_ai_memories(household_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_household_id ON knowledge_graph_edges(household_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv ON knowledge_chunks USING GIN (
  to_tsvector('simple', coalesce(content, ''))
);

-- AI 会话 / 消息（复合索引同时服务 WHERE session=? 与 ORDER BY created_at DESC）
CREATE INDEX IF NOT EXISTS idx_ai_sessions_household_id ON ai_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_created ON ai_messages(ai_session_id, created_at DESC);

-- 周计划 / 购物 / 库存
CREATE INDEX IF NOT EXISTS idx_meal_plans_household_week ON meal_plans(household_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_plan_slot_sort ON meal_plan_items(meal_plan_id, plan_date, meal_slot, sort_order);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_household_week ON shopping_lists(household_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_sort ON shopping_list_items(shopping_list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_inventory_items_household_status ON inventory_items(household_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_normalized_name ON inventory_items(household_id, normalized_name);

-- 烹饪历史
CREATE INDEX IF NOT EXISTS idx_cooking_history_user_completed ON cooking_history(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cooking_history_household_completed ON cooking_history(household_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cooking_history_recipe ON cooking_history(recipe_id);

-- ============================================================================
-- 9. 种子数据 —— 系统内置（必需）
--    系统内置厨房标签：household_id=0、type=1，对所有用户可见且不可删除。
-- ============================================================================

INSERT INTO kitchen_tags (id, household_id, name, icon, color, type)
VALUES
  (100000000000000001, 0, '家常菜', 'home', 'orange', 1),
  (100000000000000002, 0, '快手菜', 'zap', 'amber', 1),
  (100000000000000003, 0, '下饭菜', 'utensils', 'stone', 1),
  (100000000000000004, 0, '早餐', 'coffee', 'yellow', 1),
  (100000000000000005, 0, '减脂餐', 'leaf', 'green', 1),
  (100000000000000006, 0, '硬菜', 'flame', 'red', 1),
  (100000000000000007, 0, '汤羹', 'droplet', 'blue', 1),
  (100000000000000008, 0, '烘焙', 'cake', 'pink', 1)
ON CONFLICT (household_id, name) DO NOTHING;

-- ============================================================================
-- 10. 种子数据 —— 演示用（可整段删除，不影响线上功能）
--     默认演示家庭 / 用户 / 成员 + 4 道演示菜谱。
-- ============================================================================

INSERT INTO households (id, name, share_code, timezone)
VALUES (202503240000001001, '默认家庭', 'DEMOHOME', 'Asia/Shanghai')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, household_id, username, password_hash, phone, display_name, email, status)
VALUES (202503240000001002, 202503240000001001, 'demo', '$2a$10$1qhQ7TNrkKfPfKCcG4WMb.g00wQ1mt9TQc2Ma8wN1UQsvL4Tmx8Hy', '', '演示用户', 'demo@aicook.local', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_members (id, household_id, user_id, role)
VALUES (202503240000001003, 202503240000001001, 202503240000001002, 'owner')
ON CONFLICT (id) DO NOTHING;

-- 演示家庭自定义标签（type 默认 2）。
INSERT INTO kitchen_tags (id, household_id, name, icon, color)
VALUES
  (202503240000001011, 202503240000001001, '家常菜', 'home', 'orange'),
  (202503240000001012, 202503240000001001, '快手菜', 'zap', 'amber'),
  (202503240000001013, 202503240000001001, '下饭菜', 'utensils', 'stone')
ON CONFLICT (household_id, name) DO NOTHING;

-- 202503250000001011 酱香宫保鸡丁
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001011,
  202503240000001001,
  202503240000001002,
  '酱香宫保鸡丁',
  '',
  'https://images.unsplash.com/photo-1702705487239-10a1ca715454?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGluZXNlJTIwZm9vZCUyMGNoaWNrZW58ZW58MXx8fHwxNzc0NDA3NjAxfDA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '家常菜',
  15,
  2,
  '["15分钟快手","下饭","家常菜"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":2,"ingredients_ready":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251101001, 202503250000001011, 0, '肉类', '鸡腿肉', '250g', ''),
  (202503251101002, 202503250000001011, 1, '蔬菜', '花生米', '50g', ''),
  (202503251101003, 202503250000001011, 2, '调料', '干辣椒', '10g', ''),
  (202503251101004, 202503250000001011, 3, '蔬菜', '大葱', '1根', ''),
  (202503251101005, 202503250000001011, 4, '调料', '生抽', '2勺', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (
  id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint
)
VALUES
  (202503251102001, 202503250000001011, 1, '', '鸡腿肉切丁，加生抽、料酒、淀粉抓匀，腌制10分钟。', TRUE, 600, '腌制能让肉质更嫩'),
  (202503251102002, 202503250000001011, 2, '', '热锅凉油，下花生米炸至酥脆，捞出备用。', FALSE, 0, '注意火候，不要糊了'),
  (202503251102003, 202503250000001011, 3, '', '锅留底油，下干辣椒、花椒爆香。', FALSE, 0, ''),
  (202503251102004, 202503250000001011, 4, '', '下鸡丁滑炒至变色。', FALSE, 0, '表面微黄即可'),
  (202503251102005, 202503250000001011, 5, '', '加入葱姜蒜炒香，倒入调好的料汁翻炒均匀。', FALSE, 0, ''),
  (202503251102006, 202503250000001011, 6, '', '最后加入炸好的花生米，快速翻匀出锅。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;

-- 202503250000001012 轻食鸡胸肉藜麦沙拉
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001012,
  202503240000001001,
  202503240000001002,
  '轻食鸡胸肉藜麦沙拉',
  '',
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwc2FsYWR8ZW58MXx8fHwxNzc0MzUxMjA3fDA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '清淡',
  10,
  1,
  '["减脂","低卡","清淡"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":1,"ingredients_ready":false}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251201001, 202503250000001012, 0, '肉类', '鸡胸肉', '150g', ''),
  (202503251201002, 202503250000001012, 1, '蔬菜', '综合生菜', '100g', ''),
  (202503251201003, 202503250000001012, 2, '蔬菜', '圣女果', '5颗', ''),
  (202503251201004, 202503250000001012, 3, '调料', '油醋汁', '2勺', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint)
VALUES
  (202503251202001, 202503250000001012, 1, '', '鸡胸肉表面划刀，加少许盐和黑胡椒煎熟。', TRUE, 300, ''),
  (202503251202002, 202503250000001012, 2, '', '蔬菜洗净沥干水分，圣女果对半切开。', FALSE, 0, ''),
  (202503251202003, 202503250000001012, 3, '', '将煎好的鸡胸肉切块，和蔬菜混合，淋上油醋汁即可。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;

-- 202503250000001013 元气火腿芝士吐司
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001013,
  202503240000001001,
  202503240000001002,
  '元气火腿芝士吐司',
  '',
  'https://images.unsplash.com/photo-1689020353604-8041221e1273?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxicmVha2Zhc3QlMjB0b2FzdHxlbnwxfHx8fDE3NzQ0MDc2MDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '早餐',
  5,
  1,
  '["早餐","快手菜","零失败"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":1,"ingredients_ready":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251301001, 202503250000001013, 0, '主食', '吐司', '2片', ''),
  (202503251301002, 202503250000001013, 1, '肉类', '火腿片', '2片', ''),
  (202503251301003, 202503250000001013, 2, '调料', '芝士片', '1片', ''),
  (202503251301004, 202503250000001013, 3, '肉类', '鸡蛋', '1个', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint)
VALUES
  (202503251302001, 202503250000001013, 1, '', '平底锅少油，打入一个鸡蛋煎至七分熟。', TRUE, 120, ''),
  (202503251302002, 202503250000001013, 2, '', '吐司表面稍微烘烤至微黄。', FALSE, 0, ''),
  (202503251302003, 202503250000001013, 3, '', '一层吐司、一层火腿、一层芝士、一层鸡蛋，再盖上一层吐司即可。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;

-- 202503250000001014 暖胃排骨玉米汤
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001014,
  202503240000001001,
  202503240000001002,
  '暖胃排骨玉米汤',
  '',
  'https://images.unsplash.com/photo-1708410262792-74d07c9f2581?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3YXJtJTIwc291cHxlbnwxfHx8fDE3NzQ0MDc2MDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '汤粥',
  60,
  2,
  '["汤粥","周末大菜","滋补"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":3,"ingredients_ready":false}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251401001, 202503250000001014, 0, '肉类', '排骨', '500g', ''),
  (202503251401002, 202503250000001014, 1, '蔬菜', '甜玉米', '1根', ''),
  (202503251401003, 202503250000001014, 2, '蔬菜', '胡萝卜', '1根', ''),
  (202503251401004, 202503250000001014, 3, '调料', '生姜', '3片', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint)
VALUES
  (202503251402001, 202503250000001014, 1, '', '排骨冷水下锅，加料酒焯水去血沫，捞出洗净。', TRUE, 180, ''),
  (202503251402002, 202503250000001014, 2, '', '玉米切段，胡萝卜切滚刀块。', FALSE, 0, ''),
  (202503251402003, 202503250000001014, 3, '', '将排骨、玉米、胡萝卜放入砂锅，加足量清水。', FALSE, 0, ''),
  (202503251402004, 202503250000001014, 4, '', '大火煮开后转小火慢炖40分钟。', TRUE, 2400, ''),
  (202503251402005, 202503250000001014, 5, '', '出锅前加少许盐调味即可。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;
