-- AICook base schema (Snowflake BIGINT IDs)
-- Ensure DB user has permissions to create extensions and schema.
-- 约定：
-- 1. 认证、分享码、成员关系、标签相关的唯一性优先以本 SQL 为准。
-- 2. backend AutoMigrate 只做字段级补齐，不再额外手写 share_code 业务索引修补。
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS aicook;
SET search_path TO aicook, public;

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
  household_id BIGINT NOT NULL REFERENCES households(id),
  -- 用户名唯一，用于当前版本登录注册。
  username VARCHAR(60) NOT NULL UNIQUE,
  -- 存储 bcrypt 哈希后的密码，禁止保存明文。
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  -- 手机号字段先入库预留，后续版本再扩展手机号登录。
  phone VARCHAR(32) DEFAULT '',
  display_name VARCHAR(60) NOT NULL,
  -- 用户头像，逻辑关联 media_assets.id（表定义在后，不使用 DB 级外键以免初始化顺序问题）。
  avatar_asset_id BIGINT,
  email VARCHAR(120) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS household_members (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  -- owner/member 等角色，便于后续扩展多厨房成员权限。
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (household_id, user_id)
);

CREATE TABLE IF NOT EXISTS kitchen_tags (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
  -- 厨房标签用于聚合某个厨房的特色菜谱分类。
  name VARCHAR(60) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '',
  color VARCHAR(32) NOT NULL DEFAULT '',
  `type` SMALLINT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (household_id, name)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
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
  household_id BIGINT NOT NULL REFERENCES households(id),
  owner_user_id BIGINT NOT NULL REFERENCES users(id),
  source_household_id BIGINT REFERENCES households(id),
  forked_from_recipe_id BIGINT REFERENCES recipes(id),
  title VARCHAR(120) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  gallery_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  recipe_id BIGINT NOT NULL REFERENCES recipes(id),
  kitchen_tag_id BIGINT NOT NULL REFERENCES kitchen_tags(id),
  -- primary: category 主标签；secondary: scenario_tags 次标签。
  relation_type VARCHAR(20) NOT NULL DEFAULT 'secondary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (recipe_id, kitchen_tag_id, relation_type)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id BIGINT PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id),
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
  recipe_id BIGINT NOT NULL REFERENCES recipes(id),
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
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  input_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT '',
  recipe_id BIGINT REFERENCES recipes(id),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
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
  knowledge_base_id BIGINT NOT NULL REFERENCES knowledge_bases(id),
  media_asset_id BIGINT REFERENCES media_assets(id),
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
  knowledge_base_id BIGINT NOT NULL REFERENCES knowledge_bases(id),
  document_id BIGINT NOT NULL REFERENCES knowledge_documents(id),
  chunk_no INT NOT NULL,
  content TEXT NOT NULL,
  source_snippet TEXT NOT NULL DEFAULT '',
  token_size INT NOT NULL DEFAULT 0,
  embedding VECTOR(1536),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_index_jobs (
  id BIGINT PRIMARY KEY,
  knowledge_base_id BIGINT NOT NULL REFERENCES knowledge_bases(id),
  document_id BIGINT NOT NULL REFERENCES knowledge_documents(id),
  status VARCHAR(30) NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS household_ai_memories (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
  user_id BIGINT REFERENCES users(id),
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
  household_id BIGINT NOT NULL REFERENCES households(id),
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

CREATE TABLE IF NOT EXISTS ai_sessions (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  recipe_id BIGINT REFERENCES recipes(id),
  scene VARCHAR(20) NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id BIGINT PRIMARY KEY,
  ai_session_id BIGINT NOT NULL REFERENCES ai_sessions(id),
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

CREATE INDEX IF NOT EXISTS idx_users_household_id ON users(household_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
-- share_code 已由 UNIQUE 约束隐式建立唯一索引，这里不再重复创建同列普通索引。
-- household_members 额外保留 user_id 单列索引，便于按用户查找其所属厨房列表。
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
-- kitchen_tags / recipe_tags 主要按 household_id 维度读取，保留单列索引便于首页分类区加载。
CREATE INDEX IF NOT EXISTS idx_kitchen_tags_household_id ON kitchen_tags(household_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_household_id ON media_assets(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_household_id ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchen_tags_recipe_id ON recipe_kitchen_tags(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchen_tags_kitchen_tag_id ON recipe_kitchen_tags(kitchen_tag_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchen_tags_relation_type ON recipe_kitchen_tags(relation_type);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_sort ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_step_no ON recipe_steps(recipe_id, step_no);
CREATE INDEX IF NOT EXISTS idx_import_jobs_input_type ON import_jobs(input_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_household_id ON knowledge_bases(household_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_base_id ON knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_base_id ON knowledge_chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_household_ai_memories_household_id ON household_ai_memories(household_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_household_id ON knowledge_graph_edges(household_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_household_id ON ai_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON ai_messages(ai_session_id);
CREATE INDEX IF NOT EXISTS idx_recipes_title_tsv ON recipes USING GIN (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, ''))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv ON knowledge_chunks USING GIN (
  to_tsvector('simple', coalesce(content, ''))
);

INSERT INTO households (id, name, share_code, timezone)
VALUES (202503240000001001, '默认家庭', 'DEMOHOME', 'Asia/Shanghai')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, household_id, username, password_hash, phone, display_name, email, status)
VALUES (202503240000001002, 202503240000001001, 'demo', '$2a$10$1qhQ7TNrkKfPfKCcG4WMb.g00wQ1mt9TQc2Ma8wN1UQsvL4Tmx8Hy', '', '演示用户', 'demo@aicook.local', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_members (id, household_id, user_id, role)
VALUES (202503240000001003, 202503240000001001, 202503240000001002, 'owner')
ON CONFLICT (household_id, user_id) DO NOTHING;

INSERT INTO kitchen_tags (id, household_id, name, icon, color)
VALUES
  (202503240000001011, 202503240000001001, '家常菜', 'home', 'orange'),
  (202503240000001012, 202503240000001001, '快手菜', 'zap', 'amber'),
  (202503240000001013, 202503240000001001, '下饭菜', 'utensils', 'stone')
ON CONFLICT (household_id, name) DO NOTHING;
