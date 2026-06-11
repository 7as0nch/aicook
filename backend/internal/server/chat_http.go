package server

// chat_http.go 仅保留 SSE 流式端点 POST /chat/send。
//
// 设计取舍：Kratos 自动生成的 HTTP/gRPC handler 是单响应模型，无法直接吐
// Server-Sent Events。AI 对话需要流式回放 answer_delta / reasoning_delta /
// tool_call / recipe_card / approval / done 等多类事件，所以保持原生 net/http
// handler。
//
// 其余原来这里的端点已经迁移到 proto：
//   - GET /chat/sessions/{id}/messages       → AIService.ListMessages
//   - GET /chat/knowledge-ingest/status      → KnowledgeService.GetKnowledgeIngestStatus
//   - POST /chat/knowledge-ingest/retry      → KnowledgeService.RetryKnowledgeDocument
//
// WxLogin 也已经从 server/wx_login_http.go 迁移到 AuthService.WxLogin。

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	gca "github.com/7as0nch/gocommon/auth"
	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/biz/ai"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"github.com/go-kratos/kratos/v2/log"
)

type AIChatHandler struct {
	usecase   *ai.AIUsecase
	knowledge *ai.KnowledgeUsecase
	authRepo  gca.AuthRepo
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

func NewAIChatHandler(usecase *ai.AIUsecase, knowledge *ai.KnowledgeUsecase, authRepo gca.AuthRepo) *AIChatHandler {
	return &AIChatHandler{
		usecase:   usecase,
		knowledge: knowledge,
		authRepo:  authRepo,
	}
}

func (h *AIChatHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /chat/send", h.handleSend)
}

func (h *AIChatHandler) handleSend(w http.ResponseWriter, r *http.Request) {
	// 鉴权先行：本端点不经过 Kratos JWT 中间件，必须在解析请求体之前拒绝匿名请求，
	// 否则会回退到默认身份执行 AI 调用（消耗配额且读写共享默认家庭的会话）。
	ctx, err := h.authContext(r)
	if err != nil {
		writeErrorJSON(w, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期，请重新登录")
		return
	}

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

	reply, err := h.usecase.StreamMessage(ctx, sessionID, ai.SendMessageRequest{
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
		// 完整原始错误进日志（排查用），对用户只吐友好文案，不暴露内部细节
		log.Errorf("chat stream failed: session_id=%d scene=%s err=%v", sessionID, req.Scene, err)
		_ = writeSSE(w, "error", map[string]any{"message": friendlyStreamError(err)})
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

func (h *AIChatHandler) ensureSession(ctx context.Context, sessionID int64, scene string, req chatSendRequest) (*data.AISession, error) {
	if sessionID > 0 {
		return h.usecase.GetSession(ctx, sessionID)
	}

	actor := common.ActorFromContext(ctx)
	return h.usecase.CreateSession(ctx, ai.CreateSessionRequest{
		HouseholdID: actor.HouseholdID,
		UserID:      actor.UserID,
		Scene:       scene,
		Title:       strings.TrimSpace(req.Title),
		RecipeID:    req.RecipeID,
		ContextJSON: req.Context,
	})
}

// authContext 校验 Authorization 头中的 JWT 并把 claims 写入 context。
// token 缺失或校验失败一律返回错误，由调用方拒绝请求；
// 绝不能静默放行，否则 ActorFromContext 会回退到共享默认身份。
func (h *AIChatHandler) authContext(r *http.Request) (context.Context, error) {
	ctx := r.Context()
	token := strings.TrimSpace(r.Header.Get(gca.AuthorizationKey))
	if token == "" {
		return nil, fmt.Errorf("missing authorization token")
	}
	claims := &auth.JwtClaims{}
	if err := h.authRepo.CheckTokenWithClaims(ctx, token, claims); err != nil {
		return nil, fmt.Errorf("invalid authorization token: %w", err)
	}
	return gca.NewContext(ctx, claims), nil
}

// friendlyStreamError 把流式执行中的内部错误转为用户可读的中文提示。
// 原始错误（含 Eino 节点路径、HTTP 细节等）只进服务端日志，绝不直接渲染给用户。
func friendlyStreamError(err error) string {
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "context deadline exceeded") || strings.Contains(msg, "timeout"):
		return "生成超时了，请稍后重试"
	case strings.Contains(msg, "context canceled"):
		return "生成已中断"
	case strings.Contains(msg, "failed to invoke tool") || strings.Contains(msg, "tool call"):
		return "处理过程中出了点问题，请换个说法重新提问"
	case strings.Contains(msg, "connection refused") || strings.Contains(msg, "no such host"):
		return "AI 服务暂时不可用，请稍后重试"
	default:
		return "出错了，请稍后重试"
	}
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

// writeErrorJSON 以 Kratos 错误信封 {code, reason, message} 返回错误，
// 与 proto 路由的错误格式一致，客户端（wx http.ts normalizeError / web client.ts）可统一解析。
func writeErrorJSON(w http.ResponseWriter, statusCode int, reason, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":    statusCode,
		"reason":  reason,
		"message": message,
	})
}
