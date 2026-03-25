package data

import (
	"context"

	"gorm.io/gorm"
)

type AIRepo struct {
	db *gorm.DB
}

func NewAIRepo(db *gorm.DB) *AIRepo {
	return &AIRepo{db: db}
}

func (r *AIRepo) CreateSession(ctx context.Context, session *AISession) error {
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *AIRepo) GetSession(ctx context.Context, sessionID int64) (*AISession, error) {
	var session AISession
	if err := r.db.WithContext(ctx).First(&session, "id = ?", sessionID).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *AIRepo) CreateMessage(ctx context.Context, message *AIMessage) error {
	return r.db.WithContext(ctx).Create(message).Error
}

func (r *AIRepo) ListRecentMessages(ctx context.Context, sessionID int64, limit int) ([]*AIMessage, error) {
	var messages []*AIMessage
	err := r.db.WithContext(ctx).Where("ai_session_id = ?", sessionID).Order("created_at DESC").Limit(limit).Find(&messages).Error
	return messages, err
}
