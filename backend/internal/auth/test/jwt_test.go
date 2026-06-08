// Package test 验证项目领域 claims：HouseholdId 能随 gocommon 签发/校验端到端往返。
// 通用中间件 / claims 机制由 gocommon 自身测试覆盖，此处不重复。
package test

import (
	"context"
	"testing"
	"time"

	gca "github.com/7as0nch/gocommon/auth"
	"google.golang.org/protobuf/types/known/durationpb"

	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/conf"
)

func newRepo(t *testing.T) gca.AuthRepo {
	t.Helper()
	cfg := &conf.Bootstrap{
		Auth: &conf.Auth{
			JwtSecret: "test-signing-key",
			TokenTtl:  durationpb.New(time.Hour),
		},
	}
	return auth.NewAuthRepo(cfg)
}

func TestTokenRoundTripCarriesHousehold(t *testing.T) {
	repo := newRepo(t)
	const (
		userID      = int64(123)
		householdID = int64(456)
		username    = "cheng jiang"
		phone       = "13988009999"
	)

	token, err := repo.NewTokenWithClaims(context.Background(), &auth.JwtClaims{
		UserId:      userID,
		HouseholdId: householdID,
		UserName:    username,
		UserPhone:   phone,
	})
	if err != nil {
		t.Fatalf("NewTokenWithClaims failed: %v", err)
	}

	claims := &auth.JwtClaims{}
	if err := repo.CheckTokenWithClaims(context.Background(), token, claims); err != nil {
		t.Fatalf("CheckTokenWithClaims failed: %v", err)
	}
	if claims.UserId != userID {
		t.Errorf("UserId: want %d, got %d", userID, claims.UserId)
	}
	if claims.HouseholdId != householdID {
		t.Errorf("HouseholdId: want %d, got %d", householdID, claims.HouseholdId)
	}
	if claims.UserName != username {
		t.Errorf("UserName: want %q, got %q", username, claims.UserName)
	}
	// jti/过期由 gocommon 统一盖戳，应非空。
	if claims.ID == "" {
		t.Error("expected jti (ID) to be stamped by gocommon, got empty")
	}
	if claims.ExpiresAt == nil {
		t.Error("expected ExpiresAt to be stamped by gocommon, got nil")
	}
}

func TestCheckTokenAcceptsBearerPrefix(t *testing.T) {
	repo := newRepo(t)
	token, err := repo.NewTokenWithClaims(context.Background(), &auth.JwtClaims{UserId: 1, HouseholdId: 2})
	if err != nil {
		t.Fatalf("NewTokenWithClaims failed: %v", err)
	}
	if err := repo.CheckTokenWithClaims(context.Background(), "Bearer "+token, &auth.JwtClaims{}); err != nil {
		t.Fatalf("CheckTokenWithClaims with Bearer prefix failed: %v", err)
	}
}

func TestCheckTokenRejectsGarbage(t *testing.T) {
	repo := newRepo(t)
	if err := repo.CheckTokenWithClaims(context.Background(), "Bearer not-a-real-token", &auth.JwtClaims{}); err == nil {
		t.Fatal("expected error for garbage token, got nil")
	}
}
