package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	apierrors "github.com/chengjiang/aicook/backend/api/aicook/errors"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/kitchen"
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
	Text               string
	Scene              string
	Attachments        []airuntime.Attachment
	QuoteContext       airuntime.QuoteContext
	ReasoningEnabled   bool
	WebSearchEnabled   bool
	ImageRecipeEnabled bool
	ApprovalResponse   *airuntime.ApprovalResponse
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
	cooking   *kitchen.CookingProgressUsecase
	knowledge *KnowledgeUsecase
}

func NewAIUsecase(repo *data.AIRepo, aiRuntime *airuntime.Runtime, cooking *kitchen.CookingProgressUsecase, knowledge *KnowledgeUsecase) *AIUsecase {
	usecase := &AIUsecase{
		repo:      repo,
		aiRuntime: aiRuntime,
		cooking:   cooking,
		knowledge: knowledge,
	}
	if aiRuntime != nil {
		aiRuntime.RegisterKnowledgeIngestManager(usecase)
		aiRuntime.RefreshADKAfterRegistrations()
	}
	return usecase
}

func (u *AIUsecase) activeCookingForPrompt(ctx context.Context, actor common.Actor) []airuntime.ActiveCookingSummary {
	if u.cooking == nil {
		return nil
	}
	return u.cooking.ListSummariesForAI(ctx, actor)
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

	actor := common.ActorFromContext(ctx)
	u.queueKnowledgeIngestFromAttachments(actor, session.ID, req.Attachments)

	recentMessages, _ := u.repo.ListRecentMessages(ctx, session.ID, 6)
	reply, err := u.aiRuntime.Reply(ctx, airuntime.ReplyRequest{
		ConversationID:     fmt.Sprintf("%d", session.ID),
		HouseholdID:        actor.HouseholdID,
		UserID:             actor.UserID,
		Scene:              req.Scene,
		Text:               req.Text,
		Attachments:        req.Attachments,
		QuoteContext:       req.QuoteContext,
		Sources:            buildSourcesFromHistory(recentMessages),
		History:            buildConversationHistory(recentMessages, userMessage.ID),
		ReasoningEnabled:   req.ReasoningEnabled,
		WebSearchEnabled:   req.WebSearchEnabled,
		ImageRecipeEnabled: req.ImageRecipeEnabled,
		InputSource:        detectInputSource(req.Attachments),
		ApprovalResponse:   req.ApprovalResponse,
		ActiveCooking:      u.activeCookingForPrompt(ctx, actor),
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

	actor := common.ActorFromContext(ctx)
	u.queueKnowledgeIngestFromAttachments(actor, session.ID, req.Attachments)

	recentMessages, _ := u.repo.ListRecentMessages(ctx, session.ID, 6)
	reply, err := u.aiRuntime.StreamReply(ctx, airuntime.ReplyRequest{
		ConversationID:     fmt.Sprintf("%d", session.ID),
		HouseholdID:        actor.HouseholdID,
		UserID:             actor.UserID,
		Scene:              req.Scene,
		Text:               req.Text,
		Attachments:        req.Attachments,
		QuoteContext:       req.QuoteContext,
		Sources:            buildSourcesFromHistory(recentMessages),
		History:            buildConversationHistory(recentMessages, userMessage.ID),
		ReasoningEnabled:   req.ReasoningEnabled,
		WebSearchEnabled:   req.WebSearchEnabled,
		ImageRecipeEnabled: req.ImageRecipeEnabled,
		InputSource:        detectInputSource(req.Attachments),
		ApprovalResponse:   req.ApprovalResponse,
		ActiveCooking:      u.activeCookingForPrompt(ctx, actor),
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
	actor := common.ActorFromContext(ctx)
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
	actor := common.ActorFromContext(ctx)
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

func jsonMapInt64(m map[string]any, key string) int64 {
	if m == nil {
		return 0
	}
	raw, ok := m[key]
	if !ok || raw == nil {
		return 0
	}
	switch v := raw.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case float64:
		return int64(v)
	case json.Number:
		n, _ := v.Int64()
		return n
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return n
	default:
		n, _ := strconv.ParseInt(strings.TrimSpace(fmt.Sprint(v)), 10, 64)
		return n
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

func optionTitlesFromPendingApproval(pa map[string]any, optionIDs []string) []string {
	titles := make([]string, 0, len(optionIDs))
	for _, optionID := range optionIDs {
		if title := optionTitleFromPendingApproval(pa, optionID); title != "" {
			titles = append(titles, title)
		}
	}
	return titles
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
	optionIDs := append([]string(nil), ar.OptionIDs...)
	if len(optionIDs) == 0 && strings.TrimSpace(ar.OptionID) != "" {
		optionIDs = []string{strings.TrimSpace(ar.OptionID)}
	}
	title := ""
	if ar.Selection != nil {
		title = strings.TrimSpace(ar.Selection.Title)
	}
	if title == "" && len(optionIDs) > 0 {
		titles := optionTitlesFromPendingApproval(pa, optionIDs)
		if len(titles) > 0 {
			title = strings.Join(titles, "、")
		}
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
		"option_ids":  optionIDs,
		"title":       title,
		"titles":      optionTitlesFromPendingApproval(pa, optionIDs),
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

func (u *AIUsecase) queueKnowledgeIngestFromAttachments(actor common.Actor, sessionID int64, attachments []airuntime.Attachment) {
	if u == nil || u.knowledge == nil || actor.HouseholdID == 0 {
		return
	}
	for _, a := range attachments {
		if !isKnowledgeDocumentAttachment(a) {
			continue
		}
		aid := strings.TrimSpace(a.AssetID)
		if aid == "" {
			continue
		}
		assetID, err := strconv.ParseInt(aid, 10, 64)
		if err != nil || assetID <= 0 {
			continue
		}
		title := strings.TrimSpace(a.Name)
		householdID := actor.HouseholdID
		ku := u.knowledge
		sid := sessionID
		go func(assetID int64, fileTitle string) {
			bg, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
			defer cancel()
			if sid > 0 {
				if s, err := u.repo.GetSession(bg, sid); err != nil || s.HouseholdID != householdID {
					return
				}
			}
			doc, err := ku.IngestMediaAssetAsDocument(bg, householdID, assetID, fileTitle)
			if sid <= 0 {
				return
			}
			u.appendKnowledgeIngestCompletionMessage(bg, sid, doc, fileTitle, err)
		}(assetID, title)
	}
}

func (u *AIUsecase) QueueKnowledgeDocumentRetry(ctx context.Context, actor common.Actor, sessionID, documentID int64) (*data.KnowledgeDocument, error) {
	if u == nil || u.knowledge == nil {
		return nil, errors.New("knowledge usecase not configured")
	}
	if actor.HouseholdID == 0 {
		return nil, errors.New("household required")
	}
	doc, err := u.knowledge.GetDocumentForHousehold(ctx, actor.HouseholdID, documentID)
	if err != nil {
		return nil, err
	}
	if doc.Status == "processing" {
		return nil, errors.New("knowledge document is still processing")
	}
	fileTitle := strings.TrimSpace(doc.Title)
	go func(householdID, sid, docID int64, title string) {
		bg, cancel := context.WithTimeout(context.Background(), 25*time.Minute)
		defer cancel()
		retried, retryErr := u.knowledge.RetryDocumentIngest(bg, householdID, docID, "user_retry")
		if sid > 0 {
			u.appendKnowledgeIngestCompletionMessage(bg, sid, retried, title, retryErr)
		}
	}(actor.HouseholdID, sessionID, doc.ID, fileTitle)
	return doc, nil
}

func (u *AIUsecase) ManageKnowledgeIngest(ctx context.Context, householdID, userID, sessionID int64, action, hint string) (*airuntime.KnowledgeIngestActionResult, error) {
	if u == nil || u.knowledge == nil {
		return nil, errors.New("knowledge usecase not configured")
	}
	ref, err := u.resolveKnowledgeIngestReference(ctx, householdID, sessionID, hint)
	if err != nil {
		return nil, err
	}
	if ref == nil {
		return &airuntime.KnowledgeIngestActionResult{
			Action:  strings.TrimSpace(action),
			Settled: true,
			Message: "我没在当前会话里找到对应的知识库文件记录。你可以直接说文件名，或重新上传一次。",
		}, nil
	}
	doc, err := u.loadKnowledgeDocumentFromReference(ctx, householdID, ref)
	if err != nil {
		return nil, err
	}
	if doc == nil {
		return &airuntime.KnowledgeIngestActionResult{
			Action:  strings.TrimSpace(action),
			Settled: true,
			Message: "我找到了相关记录，但目前还取不到对应的知识库文档。",
		}, nil
	}
	status := knowledgeIngestStatusFromDoc(doc)
	result := &airuntime.KnowledgeIngestActionResult{
		Action:          strings.TrimSpace(action),
		DocumentID:      status.DocumentID,
		MediaAssetID:    status.MediaAssetID,
		Title:           status.Title,
		Status:          status.Status,
		ProcessingStage: status.ProcessingStage,
		StageLabel:      status.StageLabel,
		Retryable:       status.Retryable,
		Partial:         status.Partial,
		Settled:         status.Settled,
		Summary:         status.Summary,
		FailureReason:   status.FailureReason,
	}
	if status.MediaAssetID != "" {
		result.Watch = &airuntime.KnowledgeIngestWatch{
			AssetID: status.MediaAssetID,
			Name:    strings.TrimSpace(status.Title),
		}
	}
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "retry":
		if doc.Status == "processing" {
			result.Message = fmt.Sprintf("这份资料还在处理中，当前进度是：%s。我会继续同步结果。", status.StageLabel)
			return result, nil
		}
		if !status.Retryable && !status.Partial {
			if status.Status == "indexed" && strings.TrimSpace(status.ProcessingStage) == "done" {
				result.Message = "这份资料已经入库完成，目前不需要重试。"
			} else {
				result.Message = "这份资料当前不适合直接重试。"
			}
			return result, nil
		}
		_, err := u.QueueKnowledgeDocumentRetry(ctx, common.Actor{HouseholdID: householdID, UserID: userID}, sessionID, doc.ID)
		if err != nil {
			return nil, err
		}
		result.Status = "processing"
		result.ProcessingStage = "fetch_object"
		result.StageLabel = "准备重试…"
		result.Settled = false
		result.Message = "已开始重试这份资料，无需重新上传；我会继续把进度和结果发到当前会话。"
		return result, nil
	default:
		switch {
		case !status.Settled:
			result.Message = fmt.Sprintf("这份资料还在处理中，当前进度是：%s。", status.StageLabel)
		case status.Partial:
			result.Message = fmt.Sprintf("这份资料已先入库可用部分内容，当前状态是：%s。你如果需要，我也可以直接重试补全。", status.StageLabel)
		case status.Status == "failed":
			result.Message = fmt.Sprintf("这份资料处理失败了，当前状态是：%s。你如果需要，我可以直接重试。", status.StageLabel)
		default:
			result.Message = fmt.Sprintf("这份资料已经处理完成，当前状态是：%s。", status.StageLabel)
		}
		return result, nil
	}
}

func (u *AIUsecase) appendKnowledgeIngestCompletionMessage(ctx context.Context, sessionID int64, doc *data.KnowledgeDocument, fileTitle string, ingestErr error) {
	if u == nil || u.repo == nil {
		return
	}
	meta := map[string]any{
		"kind":    "knowledge_ingest_notice",
		"version": 1,
	}
	displayName := strings.TrimSpace(fileTitle)
	if displayName == "" {
		displayName = "该文件"
	}
	var content string
	if ingestErr != nil {
		content = fmt.Sprintf("「%s」未能入库到「厨艺AI资料库」：%v", displayName, ingestErr)
		meta["status"] = "failed"
	} else if doc != nil {
		meta["document_id"] = strconv.FormatInt(doc.ID, 10)
		if doc.MediaAssetID != nil && *doc.MediaAssetID > 0 {
			meta["media_asset_id"] = strconv.FormatInt(*doc.MediaAssetID, 10)
		}
		meta["title"] = strings.TrimSpace(doc.Title)
		meta["status"] = strings.TrimSpace(doc.Status)
		meta["processing_stage"] = strings.TrimSpace(doc.ProcessingStage)
		meta["summary"] = strings.TrimSpace(doc.Summary)
		switch {
		case strings.TrimSpace(doc.ProcessingStage) == "extract_empty":
			content = fmt.Sprintf("「%s」已归档到「厨艺AI资料库」，但未能解析出可读文本（例如扫描版 PDF），暂无法用于向量检索。", strings.TrimSpace(doc.Title))
		case strings.TrimSpace(doc.ProcessingStage) == "extract_timeout":
			content = fmt.Sprintf("「%s」PDF 文本解析超时了；无需重新上传，我可以直接重试这份文件。", strings.TrimSpace(doc.Title))
			meta["retryable"] = true
			meta["failure_reason"] = strings.TrimSpace(doc.Summary)
		case strings.TrimSpace(doc.ProcessingStage) == "extract_skipped_large":
			content = fmt.Sprintf("「%s」超过知识库单文档大小上限，请拆分或压缩后再上传。", strings.TrimSpace(doc.Title))
		case strings.TrimSpace(doc.ProcessingStage) == "extract_partial":
			content = fmt.Sprintf("「%s」已先入库可用部分内容，但 PDF 只解析了部分页面；如果你愿意，我可以直接重试补全，无需重新上传。", strings.TrimSpace(doc.Title))
			meta["retryable"] = true
			meta["partial"] = true
			meta["failure_reason"] = strings.TrimSpace(doc.Summary)
		case strings.TrimSpace(doc.ProcessingStage) == "unsupported_type":
			content = fmt.Sprintf("「%s」暂不支持该文件类型；当前支持 PDF、TXT、Markdown、JSON、XML 和 DOCX。", strings.TrimSpace(doc.Title))
		case strings.TrimSpace(doc.ProcessingStage) == "embed_failed":
			content = fmt.Sprintf("「%s」文本片段已入库，但向量生成失败；如果你愿意，我可以直接重试这份文件。", strings.TrimSpace(doc.Title))
			meta["retryable"] = true
			meta["failure_reason"] = strings.TrimSpace(doc.Summary)
		case doc.Status == "failed" || strings.TrimSpace(doc.ProcessingStage) == "error":
			content = fmt.Sprintf("「%s」处理失败；无需重新上传，我可以直接重试这份文件。", strings.TrimSpace(doc.Title))
			meta["retryable"] = true
			meta["failure_reason"] = strings.TrimSpace(doc.Summary)
		default:
			content = fmt.Sprintf("「%s」已入库「厨艺AI资料库」：共 %d 条文本片段，可直接让我按菜名、食材检索。", strings.TrimSpace(doc.Title), doc.ChunkCount)
		}
	} else {
		content = fmt.Sprintf("「%s」入库结果未知。", displayName)
		meta["status"] = "unknown"
	}
	envelope := map[string]any{
		"sources":  []airuntime.Source{},
		"metadata": meta,
	}
	b, _ := json.Marshal(envelope)
	msg := &data.AIMessage{
		AISessionID:      sessionID,
		Role:             "assistant",
		Content:          content,
		Mode:             "notice",
		QuoteContextJSON: datatypes.JSON([]byte("{}")),
		AttachmentsJSON:  datatypes.JSON([]byte("[]")),
		ResponseMetaJSON: datatypes.JSON(b),
	}
	_ = u.repo.CreateMessage(ctx, msg)
}

type knowledgeIngestReference struct {
	DocumentID   int64
	MediaAssetID int64
	Title        string
	Summary      string
}

func (u *AIUsecase) resolveKnowledgeIngestReference(ctx context.Context, householdID, sessionID int64, hint string) (*knowledgeIngestReference, error) {
	hint = strings.TrimSpace(hint)
	if sessionID > 0 {
		messages, err := u.repo.ListRecentMessages(ctx, sessionID, 60)
		if err == nil {
			for _, message := range messages {
				if ref := knowledgeIngestReferenceFromMessage(message, hint); ref != nil {
					return ref, nil
				}
			}
		}
	}
	if hint != "" {
		doc, err := u.knowledge.FindLatestDocumentForHousehold(ctx, householdID, hint)
		if err == nil && doc != nil {
			return newKnowledgeIngestReferenceFromDocument(doc), nil
		}
	}
	doc, err := u.knowledge.FindLatestDocumentForHousehold(ctx, householdID, "")
	if err != nil {
		return nil, nil
	}
	return newKnowledgeIngestReferenceFromDocument(doc), nil
}

func (u *AIUsecase) loadKnowledgeDocumentFromReference(ctx context.Context, householdID int64, ref *knowledgeIngestReference) (*data.KnowledgeDocument, error) {
	if ref == nil {
		return nil, nil
	}
	if ref.DocumentID > 0 {
		return u.knowledge.GetDocumentForHousehold(ctx, householdID, ref.DocumentID)
	}
	if ref.MediaAssetID > 0 {
		status, err := u.knowledge.GetIngestStatusByMediaAsset(ctx, householdID, ref.MediaAssetID)
		if err != nil || status == nil || strings.TrimSpace(status.DocumentID) == "" {
			if err != nil {
				return nil, err
			}
			return nil, nil
		}
		documentID, err := strconv.ParseInt(strings.TrimSpace(status.DocumentID), 10, 64)
		if err != nil || documentID <= 0 {
			return nil, nil
		}
		return u.knowledge.GetDocumentForHousehold(ctx, householdID, documentID)
	}
	if strings.TrimSpace(ref.Title) != "" {
		return u.knowledge.FindLatestDocumentForHousehold(ctx, householdID, ref.Title)
	}
	return nil, nil
}

func knowledgeIngestReferenceFromMessage(message *data.AIMessage, hint string) *knowledgeIngestReference {
	if message == nil {
		return nil
	}
	if ref := knowledgeIngestReferenceFromNoticeMessage(message, hint); ref != nil {
		return ref
	}
	return knowledgeIngestReferenceFromUserMessage(message, hint)
}

func knowledgeIngestReferenceFromNoticeMessage(message *data.AIMessage, hint string) *knowledgeIngestReference {
	if message == nil || message.Role != "assistant" || len(message.ResponseMetaJSON) == 0 {
		return nil
	}
	var envelope map[string]any
	if err := json.Unmarshal(message.ResponseMetaJSON, &envelope); err != nil {
		return nil
	}
	metaRaw, _ := envelope["metadata"].(map[string]any)
	if metaRaw == nil || jsonMapString(metaRaw, "kind") != "knowledge_ingest_notice" {
		return nil
	}
	title := jsonMapString(metaRaw, "title")
	summary := jsonMapString(metaRaw, "summary")
	if !knowledgeIngestHintMatches(hint, message.Content, title, summary) {
		return nil
	}
	return &knowledgeIngestReference{
		DocumentID:   jsonMapInt64(metaRaw, "document_id"),
		MediaAssetID: jsonMapInt64(metaRaw, "media_asset_id"),
		Title:        title,
		Summary:      summary,
	}
}

func knowledgeIngestReferenceFromUserMessage(message *data.AIMessage, hint string) *knowledgeIngestReference {
	if message == nil || message.Role != "user" || len(message.AttachmentsJSON) == 0 {
		return nil
	}
	var attachments []airuntime.Attachment
	if err := json.Unmarshal(message.AttachmentsJSON, &attachments); err != nil {
		return nil
	}
	for _, attachment := range attachments {
		if !isKnowledgeDocumentAttachment(attachment) {
			continue
		}
		if !knowledgeIngestHintMatches(hint, attachment.Name, attachment.AssetID, attachment.URL) {
			continue
		}
		assetID, err := strconv.ParseInt(strings.TrimSpace(attachment.AssetID), 10, 64)
		if err != nil || assetID <= 0 {
			continue
		}
		return &knowledgeIngestReference{
			MediaAssetID: assetID,
			Title:        strings.TrimSpace(attachment.Name),
		}
	}
	return nil
}

func knowledgeIngestHintMatches(hint string, candidates ...string) bool {
	hint = strings.ToLower(strings.TrimSpace(hint))
	if hint == "" {
		return true
	}
	for _, candidate := range candidates {
		candidate = strings.ToLower(strings.TrimSpace(candidate))
		if candidate != "" && strings.Contains(candidate, hint) {
			return true
		}
	}
	return false
}

func newKnowledgeIngestReferenceFromDocument(doc *data.KnowledgeDocument) *knowledgeIngestReference {
	if doc == nil {
		return nil
	}
	ref := &knowledgeIngestReference{
		DocumentID: doc.ID,
		Title:      strings.TrimSpace(doc.Title),
		Summary:    strings.TrimSpace(doc.Summary),
	}
	if doc.MediaAssetID != nil && *doc.MediaAssetID > 0 {
		ref.MediaAssetID = *doc.MediaAssetID
	}
	return ref
}

func isKnowledgeDocumentAttachment(a airuntime.Attachment) bool {
	switch strings.ToLower(strings.TrimSpace(a.Type)) {
	case "document", "file":
		return true
	default:
		return false
	}
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
