-- 家庭成员个人化扩展：
--   1. 支持「虚拟成员」（user_id=0）—— 不需要绑微信账号也能加家人
--   2. 每个成员独立口味偏好（preferences JSONB），与 household-level 解耦
--   3. 头像 emoji + display_name 落库 —— 之前都是 service 层硬编码兜底
--
-- 引入 RPC：
--   - AddHouseholdMember     POST   /api/v1/households/{household_id}/members
--   - RemoveHouseholdMember  DELETE /api/v1/households/members/{member_id}
--   - GetMemberPreferences   GET    /api/v1/households/members/{member_id}/preferences
--   - UpdateMemberPreferences PUT   /api/v1/households/members/{member_id}/preferences

SET search_path TO aicook;

-- 1) 加新列
ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emoji        VARCHAR(8)  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferences  JSONB       NOT NULL DEFAULT '{}'::jsonb;

-- 2) 旧的 UNIQUE(household_id, user_id) 阻止添加多个 user_id=0 的虚拟成员。
--    改成 partial unique：只对真实账号（user_id > 0）去重。
--    base.sql 里这个约束的名字通常是 household_members_household_id_user_id_key（PG 默认命名），
--    但保险起见也尝试一下手写名。
ALTER TABLE household_members
  DROP CONSTRAINT IF EXISTS household_members_household_id_user_id_key;
ALTER TABLE household_members
  DROP CONSTRAINT IF EXISTS uq_household_members_household_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_real_user
  ON household_members (household_id, user_id)
  WHERE user_id > 0 AND deleted_at IS NULL;

-- 3) preferences 检索（推荐过滤会按 flavor / restrictions key 做匹配）
CREATE INDEX IF NOT EXISTS idx_household_members_preferences
  ON household_members USING GIN (preferences);
