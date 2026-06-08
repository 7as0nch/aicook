-- 微信小程序登录所需字段：wx_openid + wx_unionid
-- 由 V3.E.2 微信登录功能引入；通过 /api/v1/auth/wx-login 写入。
SET search_path TO aicook;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wx_openid VARCHAR(64),
  ADD COLUMN IF NOT EXISTS wx_unionid VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wx_openid ON users(wx_openid) WHERE wx_openid IS NOT NULL AND wx_openid <> '';
CREATE INDEX IF NOT EXISTS idx_users_wx_unionid ON users(wx_unionid) WHERE wx_unionid IS NOT NULL AND wx_unionid <> '';
