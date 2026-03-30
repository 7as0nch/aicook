package biz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	apierrors "github.com/chengjiang/aicook/backend/api/aicook/errors"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type AIRepo interface {
	CreateSession(ctx context.Context, session *data.AISession) error
	GetSession(ctx context.Context, sessionID int64) (*data.AISession, error)
	CreateMessage(ctx context.Context, message *data.AIMessage) error
	ListSessions(ctx context.Context, householdID, userID int64, scene string, limit int) ([]*data.AISession, error)
	ListRecentMessages(ctx context.Context, sessionID int64, limit int) ([]*data.AIMessage, error)
	ListMessages(ctx context.Context, sessionID int64, limit int) ([]*data.AIMessage, error)
	ListMessagesPage(ctx context.Context, sessionID int64, beforeMessageID int64, limit int) ([]*data.AIMessage, bool, error)
	FindAssistantMessageByPendingApprovalID(ctx context.Context, sessionID int64, approvalID string) (*data.AIMessage, error)
	UpdateMessageResponseMetaJSON(ctx context.Context, sessionID, messageID int64, metaJSON datatypes.JSON) error
	UpdateSessionTitle(ctx context.Context, sessionID int64, title string) error
	DeleteSession(ctx context.Context, sessionID int64) error
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
	Text             string
	Scene            string
	Attachments      []airuntime.Attachment
	QuoteContext     airuntime.QuoteContext
	ReasoningEnabled bool
	WebSearchEnabled bool
	ImageRecipeEnabled bool
	ApprovalResponse *airuntime.ApprovalResponse
}

type SendMessageResponse struct {
	Session   *data.AISession
	User      *data.AIMessage
	Assistant *data.AIMessage
	Reply     *airuntime.ReplyResponse
}

type ListSessionsRequest struct {
	Scene string
	Limit int
}

type ListMessagesRequest struct {
	SessionID       int64
	Limit           int
	BeforeMessageID int64
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

func (u *AIUsecase) GetSession(ctx context.Context, sessionID int64) (*data.AISession, error) {
	session, err := u.repo.GetSession(ctx, sessionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierrors.ErrorNotFound("ai session not found")
		}
		return nil, err
	}
	return ensureSessionAccess(ctx, session)
}

func (u *AIUsecase) SendMessage(ctx context.Context, sessionID int64, req SendMessageRequest) (*SendMessageResponse, error) {
	session, err := u.GetSession(ctx, sessionID)
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
		ResponseMetaJSON: datatypes.JSON([]byte("[]")),
	}
	if err := u.repo.CreateMessage(ctx, userMessage); err != nil {
		return nil, err
	}
	u.persistAssistantApprovalChoice(ctx, session.ID, req.ApprovalResponse)
	session = u.updateSessionTitleIfNeeded(ctx, session, req.Text)

	recentMessages, _ := u.repo.ListRecentMessages(ctx, session.ID, 6)
	actor := ActorFromContext(ctx)
	reply, err := u.aiRuntime.Reply(ctx, airuntime.ReplyRequest{
		ConversationID:   fmt.Sprintf("%d", session.ID),
		HouseholdID:      actor.HouseholdID,
		UserID:           actor.UserID,
		Scene:            req.Scene,
		Text:             req.Text,
		Attachments:      req.Attachments,
		QuoteContext:     req.QuoteContext,
		Sources:          buildSourcesFromHistory(recentMessages),
		History:          buildConversationHistory(recentMessages, userMessage.ID),
		ReasoningEnabled: req.ReasoningEnabled,
		WebSearchEnabled: req.WebSearchEnabled,
		ImageRecipeEnabled: req.ImageRecipeEnabled,
		InputSource:      detectInputSource(req.Attachments),
		ApprovalResponse: req.ApprovalResponse,
	})
	if err != nil {
		return nil, err
	}

	responseMeta, _ := json.Marshal(buildAssistantResponseMeta(reply))
	assistantMessage := &data.AIMessage{
		AISessionID:      session.ID,
		Role:             "assistant",
		Content:          reply.Content,
		Mode:             string(reply.Mode),
		QuoteContextJSON: datatypes.JSON([]byte("{}")),
		AttachmentsJSON:  datatypes.JSON([]byte("[]")),
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

func (u *AIUsecase) StreamMessage(ctx context.Context, sessionID int64, req SendMessageRequest, onChunk func(airuntime.StreamEvent) error) (*SendMessageResponse, error) {
	session, err := u.GetSession(ctx, sessionID)
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
		ResponseMetaJSON: datatypes.JSON([]byte("[]")),
	}
	if err := u.repo.CreateMessage(ctx, userMessage); err != nil {
		return nil, err
	}
	u.persistAssistantApprovalChoice(ctx, session.ID, req.ApprovalResponse)
	session = u.updateSessionTitleIfNeeded(ctx, session, req.Text)

	recentMessages, _ := u.repo.ListRecentMessages(ctx, session.ID, 6)
	actor := ActorFromContext(ctx)
	reply, err := u.aiRuntime.StreamReply(ctx, airuntime.ReplyRequest{
		ConversationID:   fmt.Sprintf("%d", session.ID),
		HouseholdID:      actor.HouseholdID,
		UserID:           actor.UserID,
		Scene:            req.Scene,
		Text:             req.Text,
		Attachments:      req.Attachments,
		QuoteContext:     req.QuoteContext,
		Sources:          buildSourcesFromHistory(recentMessages),
		History:          buildConversationHistory(recentMessages, userMessage.ID),
		ReasoningEnabled: req.ReasoningEnabled,
		WebSearchEnabled: req.WebSearchEnabled,
		ImageRecipeEnabled: req.ImageRecipeEnabled,
		InputSource:      detectInputSource(req.Attachments),
		ApprovalResponse: req.ApprovalResponse,
	}, onChunk)
	if err != nil {
		return nil, err
	}

	responseMeta, _ := json.Marshal(buildAssistantResponseMeta(reply))
	assistantMessage := &data.AIMessage{
		AISessionID:      session.ID,
		Role:             "assistant",
		Content:          reply.Content,
		Mode:             string(reply.Mode),
		QuoteContextJSON: datatypes.JSON([]byte("{}")),
		AttachmentsJSON:  datatypes.JSON([]byte("[]")),
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

func (u *AIUsecase) ListSessions(ctx context.Context, req ListSessionsRequest) ([]*data.AISession, error) {
	actor := ActorFromContext(ctx)
	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}
	return u.repo.ListSessions(ctx, actor.HouseholdID, actor.UserID, strings.TrimSpace(req.Scene), limit)
}

func (u *AIUsecase) ListMessages(ctx context.Context, req ListMessagesRequest) (*data.AISession, []*data.AIMessage, error) {
	session, err := u.GetSession(ctx, req.SessionID)
	if err != nil {
		return nil, nil, err
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 5
	}
	messages, _, err := u.repo.ListMessagesPage(ctx, session.ID, req.BeforeMessageID, limit)
	if err != nil {
		return nil, nil, err
	}
	return session, messages, nil
}

func (u *AIUsecase) ListMessagesPage(ctx context.Context, req ListMessagesRequest) (*data.AISession, []*data.AIMessage, bool, error) {
	session, err := u.GetSession(ctx, req.SessionID)
	if err != nil {
		return nil, nil, false, err
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 5
	}
	messages, hasMore, err := u.repo.ListMessagesPage(ctx, session.ID, req.BeforeMessageID, limit)
	if err != nil {
		return nil, nil, false, err
	}
	return session, messages, hasMore, nil
}

func (u *AIUsecase) DeleteSession(ctx context.Context, sessionID int64) error {
	session, err := u.GetSession(ctx, sessionID)
	if err != nil {
		return err
	}
	return u.repo.DeleteSession(ctx, session.ID)
}

func buildSourcesFromHistory(messages []*data.AIMessage) []airuntime.Source {
	sources := make([]airuntime.Source, 0)
	for _, message := range messages {
		if message.Role != "assistant" || len(message.ResponseMetaJSON) == 0 {
			continue
		}
		var envelope struct {
			Sources []airuntime.Source `json:"sources"`
		}
		if err := json.Unmarshal(message.ResponseMetaJSON, &envelope); err == nil && len(envelope.Sources) > 0 {
			sources = append(sources, envelope.Sources...)
			continue
		}
		var legacy []airuntime.Source
		if err := json.Unmarshal(message.ResponseMetaJSON, &legacy); err == nil {
			sources = append(sources, legacy...)
		}
	}
	return sources
}

func buildConversationHistory(messages []*data.AIMessage, currentUserMessageID int64) []airuntime.HistoryMessage {
	if len(messages) == 0 {
		return nil
	}
	history := make([]airuntime.HistoryMessage, 0, len(messages))
	for idx := len(messages) - 1; idx >= 0; idx-- {
		message := messages[idx]
		if message == nil || message.ID == currentUserMessageID {
			continue
		}
		content := strings.TrimSpace(message.Content)
		if content == "" {
			continue
		}
		history = append(history, airuntime.HistoryMessage{
			Role:    message.Role,
			Content: content,
		})
	}
	return history
}

func (u *AIUsecase) updateSessionTitleIfNeeded(ctx context.Context, session *data.AISession, firstMessage string) *data.AISession {
	if session == nil || strings.TrimSpace(firstMessage) == "" {
		return session
	}
	if strings.TrimSpace(session.Title) != "" && strings.TrimSpace(session.Title) != "厨艺助理" && strings.TrimSpace(session.Title) != "AI 对话" {
		return session
	}

	title, err := u.aiRuntime.GenerateSessionTitle(ctx, firstMessage)
	if err != nil {
		title = fallbackSessionTitle(firstMessage)
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = fallbackSessionTitle(firstMessage)
	}
	if title == "" {
		return session
	}
	if err := u.repo.UpdateSessionTitle(ctx, session.ID, title); err != nil {
		return session
	}
	session.Title = title
	return session
}

func fallbackSessionTitle(text string) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) == 0 {
		return "AI 对话"
	}
	if len(runes) > 16 {
		return string(runes[:16])
	}
	return string(runes)
}

func ensureSessionAccess(ctx context.Context, session *data.AISession) (*data.AISession, error) {
	if session == nil {
		return nil, apierrors.ErrorNotFound("ai session not found")
	}
	actor := ActorFromContext(ctx)
	if actor.HouseholdID > 0 && session.HouseholdID != actor.HouseholdID {
		return nil, apierrors.ErrorNotFound("ai session not found")
	}
	if actor.UserID > 0 && session.UserID != actor.UserID {
		return nil, apierrors.ErrorNotFound("ai session not found")
	}
	return session, nil
}

func buildAssistantResponseMeta(reply *airuntime.ReplyResponse) map[string]any {
	if reply == nil {
		return map[string]any{
			"sources": []airuntime.Source{},
		}
	}
	return map[string]any{
		"sources":  reply.Sources,
		"metadata": reply.Metadata,
	}
}

func jsonMapString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	raw, ok := m[key]
	if !ok || raw == nil {
		return ""
	}
	switch v := raw.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strings.TrimSpace(strconv.FormatInt(int64(v), 10))
	case json.Number:
		return strings.TrimSpace(v.String())
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func optionTitleFromPendingApproval(pa map[string]any, optionID string) string {
	optionID = strings.TrimSpace(optionID)
	if optionID == "" {
		return ""
	}
	rawOpts, ok := pa["options"].([]any)
	if !ok {
		return ""
	}
	for _, item := range rawOpts {
		om, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if jsonMapString(om, "id") != optionID {
			continue
		}
		if t := jsonMapString(om, "title"); t != "" {
			return t
		}
	}
	return ""
}

// persistAssistantApprovalChoice clears pending_approval on the matching assistant row and stores approval_resolved so history reloads cannot re-submit.
func (u *AIUsecase) persistAssistantApprovalChoice(ctx context.Context, sessionID int64, ar *airuntime.ApprovalResponse) {
	if ar == nil || strings.TrimSpace(ar.ApprovalID) == "" {
		return
	}
	msg, err := u.repo.FindAssistantMessageByPendingApprovalID(ctx, sessionID, ar.ApprovalID)
	if err != nil || msg == nil {
		return
	}
	var envelope map[string]any
	if err := json.Unmarshal(msg.ResponseMetaJSON, &envelope); err != nil {
		return
	}
	metaRaw, _ := envelope["metadata"].(map[string]any)
	if metaRaw == nil {
		return
	}
	if existing, _ := metaRaw["approval_resolved"].(map[string]any); len(existing) > 0 {
		return
	}
	pa, _ := metaRaw["pending_approval"].(map[string]any)
	if pa == nil {
		return
	}
	if jsonMapString(pa, "id") != strings.TrimSpace(ar.ApprovalID) {
		return
	}
	title := ""
	if ar.Selection != nil {
		title = strings.TrimSpace(ar.Selection.Title)
	}
	if title == "" {
		title = optionTitleFromPendingApproval(pa, ar.OptionID)
	}
	if title == "" {
		title = strings.TrimSpace(ar.OptionID)
	}
	prompt := jsonMapString(pa, "prompt")
	delete(metaRaw, "pending_approval")
	metaRaw["approval_resolved"] = map[string]any{
		"approval_id": ar.ApprovalID,
		"option_id":   ar.OptionID,
		"title":       title,
		"confirmed":   ar.Confirmed,
		"prompt":      prompt,
	}
	envelope["metadata"] = metaRaw
	out, err := json.Marshal(envelope)
	if err != nil {
		return
	}
	_ = u.repo.UpdateMessageResponseMetaJSON(ctx, sessionID, msg.ID, datatypes.JSON(out))
}

func detectInputSource(attachments []airuntime.Attachment) string {
	if len(attachments) == 0 {
		return "text"
	}
	hasImage := false
	hasAudio := false
	for _, attachment := range attachments {
		switch strings.ToLower(strings.TrimSpace(attachment.Type)) {
		case "image":
			hasImage = true
		case "audio":
			hasAudio = true
		}
	}
	switch {
	case hasImage && hasAudio:
		return "multimodal"
	case hasImage:
		return "image"
	case hasAudio:
		return "voice"
	default:
		return "file"
	}
}
