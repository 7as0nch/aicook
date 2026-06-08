-- 收藏菜谱表
-- 一个用户在同一家庭下，对同一菜谱只能收藏一次（unique constraint）。
-- household_id 冗余存储，方便按家庭统计 + 切换家庭时区分作用域。

SET search_path TO aicook;

CREATE TABLE IF NOT EXISTS recipe_favorites (
  id BIGINT PRIMARY KEY,
  household_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  recipe_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

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
