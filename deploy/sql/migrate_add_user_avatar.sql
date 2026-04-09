-- 已有库执行一次：为用户增加头像 asset 引用
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_asset_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_users_avatar_asset_id ON users(avatar_asset_id);
