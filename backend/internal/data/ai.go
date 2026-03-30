package data

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"gorm.io/datatypes"
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
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(message).Error; err != nil {
			return err
		}
		return tx.Model(&AISession{}).
			Where("id = ?", message.AISessionID).
			Update("updated_at", time.Now()).
			Error
	})
}

func (r *AIRepo) ListSessions(ctx context.Context, householdID, userID int64, scene string, limit int) ([]*AISession, error) {
	if limit <= 0 {
		limit = 20
	}
	query := r.db.WithContext(ctx).
		Where("household_id = ? AND user_id = ?", householdID, userID).
		Order("updated_at DESC, created_at DESC").
		Limit(limit)
	if scene != "" {
		query = query.Where("scene = ?", scene)
	}

	var sessions []*AISession
	if err := query.Find(&sessions).Error; err != nil {
		return nil, err
	}
	return sessions, nil
}

func (r *AIRepo) ListRecentMessages(ctx context.Context, sessionID int64, limit int) ([]*AIMessage, error) {
	var messages []*AIMessage
	err := r.db.WithContext(ctx).Where("ai_session_id = ?", sessionID).Order("created_at DESC").Limit(limit).Find(&messages).Error
	return messages, err
}

func pendingApprovalIDFromMessageJSON(raw []byte) (string, bool) {
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return "", false
	}
	meta, _ := envelope["metadata"].(map[string]any)
	if meta == nil {
		return "", false
	}
	pa, _ := meta["pending_approval"].(map[string]any)
	if pa == nil {
		return "", false
	}
	id, _ := pa["id"].(string)
	id = strings.TrimSpace(id)
	return id, id != ""
}

// FindAssistantMessageByPendingApprovalID scans recent assistant rows for matching metadata.pending_approval.id (newest first).
func (r *AIRepo) FindAssistantMessageByPendingApprovalID(ctx context.Context, sessionID int64, approvalID string) (*AIMessage, error) {
	approvalID = strings.TrimSpace(approvalID)
	if approvalID == "" {
		return nil, nil
	}
	var messages []AIMessage
	err := r.db.WithContext(ctx).
		Where("ai_session_id = ? AND role = ?", sessionID, "assistant").
		Order("id DESC").
		Limit(120).
		Find(&messages).Error
	if err != nil {
		return nil, err
	}
	for i := range messages {
		id, ok := pendingApprovalIDFromMessageJSON(messages[i].ResponseMetaJSON)
		if ok && id == approvalID {
			return &messages[i], nil
		}
	}
	return nil, nil
}

func (r *AIRepo) UpdateMessageResponseMetaJSON(ctx context.Context, sessionID, messageID int64, metaJSON datatypes.JSON) error {
	return r.db.WithContext(ctx).
		Model(&AIMessage{}).
		Where("id = ? AND ai_session_id = ?", messageID, sessionID).
		Updates(map[string]any{
			"response_meta_json": metaJSON,
			"updated_at":         time.Now(),
		}).Error
}

func (r *AIRepo) ListMessages(ctx context.Context, sessionID int64, limit int) ([]*AIMessage, error) {
	if limit <= 0 {
		limit = 100
	}
	var messages []*AIMessage
	err := r.db.WithContext(ctx).
		Where("ai_session_id = ?", sessionID).
		Order("created_at ASC, id ASC").
		Limit(limit).
		Find(&messages).Error
	return messages, err
}

func (r *AIRepo) ListMessagesPage(ctx context.Context, sessionID int64, beforeMessageID int64, limit int) ([]*AIMessage, bool, error) {
	if limit <= 0 {
		limit = 5
	}
	query := r.db.WithContext(ctx).
		Where("ai_session_id = ?", sessionID)
	if beforeMessageID > 0 {
		query = query.Where("id < ?", beforeMessageID)
	}

	var messages []*AIMessage
	if err := query.
		Order("id DESC").
		Limit(limit + 1).
		Find(&messages).Error; err != nil {
		return nil, false, err
	}

	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}
	for left, right := 0, len(messages)-1; left < right; left, right = left+1, right-1 {
		messages[left], messages[right] = messages[right], messages[left]
	}
	return messages, hasMore, nil
}

func (r *AIRepo) UpdateSessionTitle(ctx context.Context, sessionID int64, title string) error {
	return r.db.WithContext(ctx).
		Model(&AISession{}).
		Where("id = ?", sessionID).
		Updates(map[string]any{
			"title":      title,
			"updated_at": time.Now(),
		}).Error
}

func (r *AIRepo) DeleteSession(ctx context.Context, sessionID int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("ai_session_id = ?", sessionID).Delete(&AIMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&AISession{}, "id = ?", sessionID).Error; err != nil {
			return err
		}
		return nil
	})
}
