package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/biz"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
)

type AIChatHandler struct {
	usecase   *biz.AIUsecase
	knowledge *biz.KnowledgeUsecase
	authRepo  auth.AuthRepo
}

type chatSessionID string

type chatSendRequest struct {
	SessionID          chatSessionID               `json:"session_id"`
	Scene              string                      `json:"scene"`
	Title              string                      `json:"title"`
	RecipeID           *int64                      `json:"recipe_id,omitempty"`
	Context            json.RawMessage             `json:"context,omitempty"`
	Text               string                      `json:"text"`
	Attachments        []airuntime.Attachment      `json:"attachments"`
	QuoteContext       airuntime.QuoteContext      `json:"quote_context"`
	ReasoningEnabled   bool                        `json:"reasoning_enabled"`
	WebSearchEnabled   bool                        `json:"web_search_enabled"`
	ImageRecipeEnabled bool                        `json:"image_recipe_enabled"`
	ApprovalResponse   *airuntime.ApprovalResponse `json:"approval_response,omitempty"`
}

type chatKnowledgeRetryRequest struct {
	SessionID  chatSessionID `json:"session_id"`
	DocumentID string        `json:"document_id"`
}

func (id *chatSessionID) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		*id = ""
		return nil
	}
	var asString string
	if err := json.Unmarshal(data, &asString); err == nil {
		*id = chatSessionID(strings.TrimSpace(asString))
		return nil
	}
	var asNumber int64
	if err := json.Unmarshal(data, &asNumber); err == nil {
		*id = chatSessionID(strconv.FormatInt(asNumber, 10))
		return nil
	}
	return strconv.ErrSyntax
}

func (id chatSessionID) Int64() (int64, error) {
	if strings.TrimSpace(string(id)) == "" {
		return 0, nil
	}
	return strconv.ParseInt(string(id), 10, 64)
}

func NewAIChatHandler(usecase *biz.AIUsecase, knowledge *biz.KnowledgeUsecase, authRepo auth.AuthRepo) *AIChatHandler {
	return &AIChatHandler{
		usecase:   usecase,
		knowledge: knowledge,
		authRepo:  authRepo,
	}
}

func (h *AIChatHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /chat/send", h.handleSend)
	mux.HandleFunc("GET /chat/sessions/{session_id}/messages", h.handleListMessages)
	mux.HandleFunc("GET /chat/knowledge-ingest/status", h.handleKnowledgeIngestStatus)
	mux.HandleFunc("POST /chat/knowledge-ingest/retry", h.handleKnowledgeIngestRetry)
}

func (h *AIChatHandler) handleSend(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	var req chatSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	req.Text = strings.TrimSpace(req.Text)
	if req.Text == "" && len(req.Attachments) == 0 && req.ApprovalResponse == nil {
		http.Error(w, "text, attachments or approval_response is required", http.StatusBadRequest)
		return
	}

	ctx := h.authContext(r)

	scene := strings.TrimSpace(req.Scene)
	if scene == "" {
		scene = strings.TrimSpace(req.QuoteContext.Scene)
	}
	if scene == "" {
		scene = "chat"
	}

	sessionID, err := req.SessionID.Int64()
	if err != nil {
		http.Error(w, "invalid session_id", http.StatusBadRequest)
		return
	}
	session, err := h.ensureSession(ctx, sessionID, scene, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sessionID = session.ID
	if req.Scene == "" {
		req.Scene = session.Scene
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	if err := writeSSE(w, "start", map[string]any{
		"session_id": strconv.FormatInt(session.ID, 10),
		"scene":      session.Scene,
		"title":      session.Title,
	}); err != nil {
		return
	}
	flusher.Flush()

	reply, err := h.usecase.StreamMessage(ctx, sessionID, biz.SendMessageRequest{
		Text:               req.Text,
		Scene:              req.Scene,
		Attachments:        req.Attachments,
		QuoteContext:       req.QuoteContext,
		ReasoningEnabled:   req.ReasoningEnabled,
		WebSearchEnabled:   req.WebSearchEnabled,
		ImageRecipeEnabled: req.ImageRecipeEnabled,
		ApprovalResponse:   req.ApprovalResponse,
	}, func(chunk airuntime.StreamEvent) error {
		eventName := "answer_delta"
		switch chunk.Kind {
		case airuntime.StreamEventReasoning:
			eventName = "reasoning_delta"
		case airuntime.StreamEventStatus:
			eventName = "status_delta"
		case airuntime.StreamEventToolCall:
			eventName = "tool_call"
		case airuntime.StreamEventRecipeCard:
			eventName = "recipe_card"
		case airuntime.StreamEventAgentCall:
			eventName = "agent_delta"
		case airuntime.StreamEventApproval:
			eventName = "approval"
		}
		payload := map[string]any{
			"content":    chunk.Content,
			"run_id":     chunk.RunID,
			"message_id": chunk.MessageID,
			"seq":        chunk.Sequence,
			"part_type":  chunk.PartType,
			"call_id":    chunk.CallID,
		}
		for key, value := range chunk.Metadata {
			payload[key] = value
		}
		if err := writeSSE(w, eventName, payload); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	})
	if err != nil {
		_ = writeSSE(w, "error", map[string]any{"message": err.Error()})
		flusher.Flush()
		return
	}

	runID := ""
	if timeline := reply.Reply.Metadata.Timeline; len(timeline) > 0 {
		runID = timeline[len(timeline)-1].RunID
	}
	donePayload := map[string]any{
		"session_id":           strconv.FormatInt(reply.Session.ID, 10),
		"user_message_id":      strconv.FormatInt(reply.User.ID, 10),
		"assistant_message_id": strconv.FormatInt(reply.Assistant.ID, 10),
		"run_id":               runID,
		"reply_content":        reply.Reply.Content,
		"reasoning_content":    reply.Reply.ReasoningContent,
		"reply_mode":           reply.Reply.Mode,
		"reply_model":          reply.Reply.Model,
		"reply_sources":        reply.Reply.Sources,
		"reply_sources_count":  len(reply.Reply.Sources),
		"search_results":       reply.Reply.Metadata.SearchResults,
		"is_fallback":          reply.Reply.IsFallback,
		"reply_metadata":       reply.Reply.Metadata,
	}
	if watch := mergeKnowledgeIngestWatch(
		knowledgeIngestWatchFromRequest(req),
		knowledgeIngestWatchFromReply(reply.Reply),
	); len(watch) > 0 {
		donePayload["knowledge_ingest_watch"] = watch
	}
	_ = writeSSE(w, "done", donePayload)
	flusher.Flush()
}

func knowledgeIngestWatchFromRequest(req chatSendRequest) []map[string]any {
	out := make([]map[string]any, 0, len(req.Attachments))
	for _, a := range req.Attachments {
		if !knowledgeIngestAttachmentType(a.Type) {
			continue
		}
		aid := strings.TrimSpace(a.AssetID)
		if aid == "" {
			continue
		}
		out = append(out, map[string]any{
			"asset_id": aid,
			"name":     strings.TrimSpace(a.Name),
		})
	}
	return out
}

func knowledgeIngestWatchFromReply(reply *airuntime.ReplyResponse) []map[string]any {
	if reply == nil || len(reply.Metadata.KnowledgeIngestWatch) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(reply.Metadata.KnowledgeIngestWatch))
	for _, item := range reply.Metadata.KnowledgeIngestWatch {
		assetID := strings.TrimSpace(item.AssetID)
		if assetID == "" {
			continue
		}
		out = append(out, map[string]any{
			"asset_id": assetID,
			"name":     strings.TrimSpace(item.Name),
		})
	}
	return out
}

func mergeKnowledgeIngestWatch(groups ...[]map[string]any) []map[string]any {
	merged := make(map[string]map[string]any)
	for _, group := range groups {
		for _, item := range group {
			if item == nil {
				continue
			}
			assetID := strings.TrimSpace(fmt.Sprint(item["asset_id"]))
			if assetID == "" {
				continue
			}
			name := strings.TrimSpace(fmt.Sprint(item["name"]))
			if existing, ok := merged[assetID]; ok {
				if strings.TrimSpace(fmt.Sprint(existing["name"])) == "" && name != "" {
					existing["name"] = name
				}
				continue
			}
			entry := map[string]any{"asset_id": assetID}
			if name != "" {
				entry["name"] = name
			}
			merged[assetID] = entry
		}
	}
	if len(merged) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(merged))
	for _, item := range merged {
		out = append(out, item)
	}
	return out
}

func knowledgeIngestAttachmentType(t string) bool {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "document", "file":
		return true
	default:
		return false
	}
}

func (h *AIChatHandler) handleKnowledgeIngestStatus(w http.ResponseWriter, r *http.Request) {
	if h.knowledge == nil {
		writeErrorJSON(w, http.StatusServiceUnavailable, "knowledge not configured")
		return
	}
	assetIDStr := strings.TrimSpace(r.URL.Query().Get("asset_id"))
	if assetIDStr == "" {
		writeErrorJSON(w, http.StatusBadRequest, "asset_id is required")
		return
	}
	assetID, err := strconv.ParseInt(assetIDStr, 10, 64)
	if err != nil || assetID <= 0 {
		writeErrorJSON(w, http.StatusBadRequest, "invalid asset_id")
		return
	}
	ctx := h.authContext(r)
	actor := biz.ActorFromContext(ctx)
	if actor.HouseholdID == 0 {
		writeErrorJSON(w, http.StatusUnauthorized, "household required")
		return
	}
	st, err := h.knowledge.GetIngestStatusByMediaAsset(ctx, actor.HouseholdID, assetID)
	if err != nil {
		writeErrorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, st)
}

func (h *AIChatHandler) handleKnowledgeIngestRetry(w http.ResponseWriter, r *http.Request) {
	if h.knowledge == nil {
		writeErrorJSON(w, http.StatusServiceUnavailable, "knowledge not configured")
		return
	}
	var req chatKnowledgeRetryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid request body")
		return
	}
	documentID, err := strconv.ParseInt(strings.TrimSpace(req.DocumentID), 10, 64)
	if err != nil || documentID <= 0 {
		writeErrorJSON(w, http.StatusBadRequest, "invalid document_id")
		return
	}
	sessionID, err := req.SessionID.Int64()
	if err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid session_id")
		return
	}
	ctx := h.authContext(r)
	actor := biz.ActorFromContext(ctx)
	if actor.HouseholdID == 0 {
		writeErrorJSON(w, http.StatusUnauthorized, "household required")
		return
	}
	doc, err := h.usecase.QueueKnowledgeDocumentRetry(ctx, actor, sessionID, documentID)
	if err != nil {
		writeErrorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, map[string]any{
		"accepted":         true,
		"document_id":      strconv.FormatInt(doc.ID, 10),
		"media_asset_id":   formatNullableID(doc.MediaAssetID),
		"title":            doc.Title,
		"processing_stage": "fetch_object",
		"status":           "processing",
		"stage_label":      "准备重试…",
	})
}

func (h *AIChatHandler) ensureSession(ctx context.Context, sessionID int64, scene string, req chatSendRequest) (*data.AISession, error) {
	if sessionID > 0 {
		return h.usecase.GetSession(ctx, sessionID)
	}

	actor := biz.ActorFromContext(ctx)
	return h.usecase.CreateSession(ctx, biz.CreateSessionRequest{
		HouseholdID: actor.HouseholdID,
		UserID:      actor.UserID,
		Scene:       scene,
		Title:       strings.TrimSpace(req.Title),
		RecipeID:    req.RecipeID,
		ContextJSON: req.Context,
	})
}

func (h *AIChatHandler) handleListMessages(w http.ResponseWriter, r *http.Request) {
	ctx := h.authContext(r)

	sessionID, err := strconv.ParseInt(strings.TrimSpace(r.PathValue("session_id")), 10, 64)
	if err != nil || sessionID <= 0 {
		writeErrorJSON(w, http.StatusBadRequest, "invalid session_id")
		return
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if limit <= 0 {
		limit = 5
	}
	beforeMessageID, _ := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("before_message_id")), 10, 64)

	session, messages, hasMore, err := h.usecase.ListMessagesPage(ctx, biz.ListMessagesRequest{
		SessionID:       sessionID,
		Limit:           limit,
		BeforeMessageID: beforeMessageID,
	})
	if err != nil {
		writeErrorJSON(w, http.StatusBadRequest, err.Error())
		return
	}

	response := map[string]any{
		"session":  buildSessionPayload(session),
		"messages": buildMessagePayloads(messages),
		"has_more": hasMore,
	}
	writeJSON(w, response)
}

func (h *AIChatHandler) authContext(r *http.Request) context.Context {
	ctx := r.Context()
	if token := strings.TrimSpace(r.Header.Get(auth.AuthorizationKey)); token != "" {
		if claims, err := h.authRepo.CheckToken(ctx, token); err == nil && claims != nil {
			ctx = auth.NewContext(ctx, claims)
		}
	}
	return ctx
}

func writeSSE(w http.ResponseWriter, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := w.Write([]byte("event: " + event + "\n")); err != nil {
		return err
	}
	if _, err := w.Write([]byte("data: " + string(data) + "\n\n")); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func writeErrorJSON(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"message": message,
		},
	})
}

func formatNullableID(id *int64) string {
	if id == nil || *id <= 0 {
		return ""
	}
	return strconv.FormatInt(*id, 10)
}

func buildSessionPayload(session *data.AISession) map[string]any {
	if session == nil {
		return nil
	}
	return map[string]any{
		"id":           strconv.FormatInt(session.ID, 10),
		"household_id": strconv.FormatInt(session.HouseholdID, 10),
		"user_id":      strconv.FormatInt(session.UserID, 10),
		"scene":        session.Scene,
		"title":        session.Title,
		"created_at":   formatJSONTime(session.CreatedAt),
		"updated_at":   formatJSONTime(session.UpdatedAt),
	}
}

func buildMessagePayloads(messages []*data.AIMessage) []map[string]any {
	items := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		items = append(items, buildMessagePayload(message))
	}
	return items
}

func buildMessagePayload(message *data.AIMessage) map[string]any {
	if message == nil {
		return nil
	}
	var quote airuntime.QuoteContext
	_ = json.Unmarshal(message.QuoteContextJSON, &quote)
	var attachments []airuntime.Attachment
	_ = json.Unmarshal(message.AttachmentsJSON, &attachments)
	var envelope struct {
		Sources  []airuntime.Source `json:"sources"`
		Metadata map[string]any     `json:"metadata"`
	}
	_ = json.Unmarshal(message.ResponseMetaJSON, &envelope)
	sources := make([]map[string]any, 0, len(envelope.Sources))
	for _, source := range envelope.Sources {
		sources = append(sources, map[string]any{
			"title":        source.Title,
			"document_id":  source.DocumentID,
			"snippet":      source.Snippet,
			"site_name":    source.SiteName,
			"publish_time": source.PublishTime,
			"logo_url":     source.LogoURL,
		})
	}
	attachmentItems := make([]map[string]any, 0, len(attachments))
	for _, attachment := range attachments {
		attachmentItems = append(attachmentItems, map[string]any{
			"type":         attachment.Type,
			"url":          attachment.URL,
			"content_type": attachment.ContentType,
			"name":         attachment.Name,
			"asset_id":     attachment.AssetID,
		})
	}
	return map[string]any{
		"id":               strconv.FormatInt(message.ID, 10),
		"ai_session_id":    strconv.FormatInt(message.AISessionID, 10),
		"role":             message.Role,
		"content":          message.Content,
		"mode":             message.Mode,
		"quote_context":    map[string]any{"selected_text": quote.SelectedText, "selection_source": quote.SelectionSource, "surrounding_text": quote.SurroundingText, "scene": quote.Scene},
		"attachments":      attachmentItems,
		"response_sources": sources,
		"response_meta":    envelope.Metadata,
		"created_at":       formatJSONTime(message.CreatedAt),
		"updated_at":       formatJSONTime(message.UpdatedAt),
	}
}

func formatJSONTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339Nano)
}
