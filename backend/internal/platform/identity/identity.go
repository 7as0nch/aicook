package identity

// 默认身份兜底值，仅供 biz/common.DefaultActor 使用。
// 注意：所有正常请求链路都应携带 JWT 身份；走到默认身份说明链路缺鉴权（会有告警日志）。
var (
	DefaultHouseholdID int64 = 202503240000001001
	DefaultUserID      int64 = 202503240000001002
)
