package biz

import (
	"context"

	gca "github.com/7as0nch/gocommon/auth"
	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/platform/identity"
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
	return DefaultActor()
}
