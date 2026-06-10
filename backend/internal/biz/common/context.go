package common

import (
	"context"

	gca "github.com/7as0nch/gocommon/auth"
	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/platform/identity"
	"github.com/go-kratos/kratos/v2/log"
)

type Actor struct {
	HouseholdID int64
	UserID      int64
}

func DefaultActor() Actor {
	return Actor{
		HouseholdID: identity.DefaultHouseholdID,
		UserID:      identity.DefaultUserID,
	}
}

func ActorFromContext(ctx context.Context) Actor {
	if ctx != nil {
		// 鉴权中间件（gocommon auth.Server）与 AI 聊天处理器都会把 claims 写入 context，
		// 这里统一从 context 取，无需再从 header 反解 token。
		if claims, ok := gca.FromContext(ctx); ok {
			if jwtClaims, ok := claims.(*auth.JwtClaims); ok {
				return Actor{
					HouseholdID: jwtClaims.HouseholdId,
					UserID:      jwtClaims.UserId,
				}
			}
		}
	}
	// 所有调用方都应处于 JWT 中间件（或 /chat/send 的显式鉴权）之后，正常不会走到这里。
	// 一旦触发说明某条链路缺少鉴权，立即告警以便发现，不要默默以共享默认身份执行。
	log.Warnf("ActorFromContext: 上下文缺少身份信息，回退默认身份（疑似未鉴权链路）")
	return DefaultActor()
}
