package biz

import (
	"context"
	"encoding/json"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
)

type AIRepo interface {
	CreateSession(ctx context.Context, session *data.AISession) error
	GetSession(ctx context.Context, sessionID int64) (*data.AISession, error)
	CreateMessage(ctx context.Context, message *data.AIMessage) error
	ListRecentMessages(ctx context.Context, sessionID int64, limit int) ([]*data.AIMessage, error)
}

type CreateSessionRequest struct {
	HouseholdID int64
	UserID      int64
	Scene       string
	Title       string
	RecipeID    *int64
	ContextJSON json.RawMessage
}

type SendMessageRequest struct {
	Text         string
	Scene        string
	Attachments  []airuntime.Attachment
	QuoteContext airuntime.QuoteContext
}

type SendMessageResponse struct {
	Session   *data.AISession
	User      *data.AIMessage
	Assistant *data.AIMessage
	Reply     *airuntime.ReplyResponse
}

type AIUsecase struct {
	repo      AIRepo
	aiRuntime *airuntime.Runtime
}

func NewAIUsecase(repo *data.AIRepo, aiRuntime *airuntime.Runtime) *AIUsecase {
	return &AIUsecase{
		repo:      repo,
		aiRuntime: aiRuntime,
	}
}

func (u *AIUsecase) CreateSession(ctx context.Context, req CreateSessionRequest) (*data.AISession, error) {
	contextMap := map[string]any{}
	if len(req.ContextJSON) > 0 {
		_ = json.Unmarshal(req.ContextJSON, &contextMap)
	}

	session := &data.AISession{
		HouseholdID: req.HouseholdID,
		UserID:      req.UserID,
		RecipeID:    req.RecipeID,
		Scene:       req.Scene,
		Title:       req.Title,
		ContextJSON: contextMap,
	}
	if err := u.repo.CreateSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (u *AIUsecase) SendMessage(ctx context.Context, sessionID int64, req SendMessageRequest) (*SendMessageResponse, error) {
	session, err := u.repo.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	attachmentsJSON, _ := json.Marshal(req.Attachments)
	quoteJSON, _ := json.Marshal(req.QuoteContext)
	userMessage := &data.AIMessage{
		AISessionID:      session.ID,
		Role:             "user",
		Content:          req.Text,
		Mode:             string(u.aiRuntime.Mode()),
		QuoteContextJSON: quoteJSON,
		AttachmentsJSON:  attachmentsJSON,
	}
	if err := u.repo.CreateMessage(ctx, userMessage); err != nil {
		return nil, err
	}

	recentMessages, _ := u.repo.ListRecentMessages(ctx, session.ID, 6)
	reply, err := u.aiRuntime.Reply(ctx, airuntime.ReplyRequest{
		Scene:        req.Scene,
		Text:         req.Text,
		Attachments:  req.Attachments,
		QuoteContext: req.QuoteContext,
		Sources:      buildSourcesFromHistory(recentMessages),
	})
	if err != nil {
		return nil, err
	}

	responseMeta, _ := json.Marshal(reply.Sources)
	assistantMessage := &data.AIMessage{
		AISessionID:      session.ID,
		Role:             "assistant",
		Content:          reply.Content,
		Mode:             string(reply.Mode),
		ResponseMetaJSON: responseMeta,
	}
	if err := u.repo.CreateMessage(ctx, assistantMessage); err != nil {
		return nil, err
	}

	return &SendMessageResponse{
		Session:   session,
		User:      userMessage,
		Assistant: assistantMessage,
		Reply:     reply,
	}, nil
}

func buildSourcesFromHistory(messages []*data.AIMessage) []airuntime.Source {
	sources := make([]airuntime.Source, 0)
	for _, message := range messages {
		if message.Role != "assistant" || len(message.ResponseMetaJSON) == 0 {
			continue
		}
		var previous []airuntime.Source
		if err := json.Unmarshal(message.ResponseMetaJSON, &previous); err == nil {
			sources = append(sources, previous...)
		}
	}
	return sources
}
