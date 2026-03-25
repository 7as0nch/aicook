package biz

import (
	"context"

	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/platform/identity"
	"github.com/go-kratos/kratos/v2/transport"
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
		if claims, ok := auth.FromContext(ctx); ok {
			if jwtClaims, ok := claims.(*auth.JwtClaims); ok {
				return Actor{
					HouseholdID: jwtClaims.HouseholdId,
					UserID:      jwtClaims.UserId,
				}
			}
		}
		if ts, ok := transport.FromServerContext(ctx); ok {
			if raw := ts.RequestHeader().Get(auth.AuthorizationKey); raw != "" {
				if claims, err := auth.NewAuthRepo().CheckToken(ctx, raw); err == nil && claims != nil {
					return Actor{
						HouseholdID: claims.HouseholdId,
						UserID:      claims.UserId,
					}
				}
			}
		}
	}
	return DefaultActor()
}
