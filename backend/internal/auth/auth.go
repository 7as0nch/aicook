// Package auth 只保留 gocommon 无法提供的项目领域定制：携带 HouseholdId 的 JwtClaims，
// 以及一个按配置构造 gocommon 鉴权仓库的 wire provider。
// 其余能力（中间件 Server/WhiteList、context 读写、错误、常量、AuthRepo 接口）
// 由各调用点直接 import github.com/7as0nch/gocommon 使用，不在本包做任何转发。
package auth

import (
	gca "github.com/7as0nch/gocommon/auth"
	"github.com/golang-jwt/jwt/v5"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

// JwtClaims 在 gocommon 默认字段之外携带 HouseholdId（多家庭切换强依赖）。
// 它实现 gocommon 的 StorableClaims 与 RegisteredClaimsStamper：
//   - 签发时由 gocommon 统一盖 jti / 签发时间 / 过期时间（按仓库 TTL）；
//   - 注入 TokenStore 后由 gocommon 据 jti 做服务端吊销校验。
type JwtClaims struct {
	UserId      int64  `json:"UserId"`
	HouseholdId int64  `json:"HouseholdId"`
	UserName    string `json:"UserName"`
	UserPhone   string `json:"UserPhone"`
	jwt.RegisteredClaims
}

// GetUserID 实现 gocommon StorableClaims（服务端吊销用）。
func (c *JwtClaims) GetUserID() int64 { return c.UserId }

// GetJTI 实现 gocommon StorableClaims，返回 token 唯一标识（jti）。
func (c *JwtClaims) GetJTI() string { return c.ID }

// StampRegistered 实现 gocommon RegisteredClaimsStamper，由 gocommon 在签发时回填标准字段。
func (c *JwtClaims) StampRegistered(jti string, issuedAt, expiresAt *jwt.NumericDate) {
	c.ID = jti
	c.IssuedAt = issuedAt
	c.ExpiresAt = expiresAt
}

// NewAuthRepo 按配置构造 gocommon 鉴权仓库，供 wire 注入；返回 gocommon 接口本身。
func NewAuthRepo(cfg *conf.Bootstrap) gca.AuthRepo {
	return gca.New(gca.Options{
		SigningKey: cfg.GetAuth().GetJwtSecret(),
		TokenTTL:   cfg.GetAuth().GetTokenTtl().AsDuration(),
	})
}
