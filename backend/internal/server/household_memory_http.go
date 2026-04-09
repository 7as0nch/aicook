package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/auth"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type HouseholdMemoryHandler struct {
	uc       *biz.KnowledgeUsecase
	authRepo auth.AuthRepo
}

func NewHouseholdMemoryHandler(uc *biz.KnowledgeUsecase, authRepo auth.AuthRepo) *HouseholdMemoryHandler {
	return &HouseholdMemoryHandler{uc: uc, authRepo: authRepo}
}

func (h *HouseholdMemoryHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/household-ai-memories", h.handleList)
	mux.HandleFunc("POST /api/v1/household-ai-memories", h.handleCreate)
}

func (h *HouseholdMemoryHandler) authContext(r *http.Request) *http.Request {
	ctx := r.Context()
	if token := strings.TrimSpace(r.Header.Get(auth.AuthorizationKey)); token != "" {
		if claims, err := h.authRepo.CheckToken(ctx, token); err == nil && claims != nil {
			ctx = auth.NewContext(ctx, claims)
		}
	}
	return r.WithContext(ctx)
}

func (h *HouseholdMemoryHandler) handleList(w http.ResponseWriter, r *http.Request) {
	r = h.authContext(r)
	ctx := r.Context()
	if _, ok := auth.FromContext(ctx); !ok {
		writeErrorJSON(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	items, err := h.uc.ListHouseholdAIMemoriesForActor(ctx, 80)
	if err != nil {
		writeErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, m := range items {
		row := map[string]any{
			"id":         m.ID,
			"scope":      m.Scope,
			"content":    m.Content,
			"source":     m.Source,
			"created_at": m.CreatedAt,
			"updated_at": m.UpdatedAt,
		}
		if m.UserID != nil {
			row["user_id"] = *m.UserID
		}
		out = append(out, row)
	}
	writeJSON(w, map[string]any{"memories": out})
}

type createMemoryBody struct {
	Content string `json:"content"`
	Scope   string `json:"scope"`
}

func (h *HouseholdMemoryHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErrorJSON(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r = h.authContext(r)
	ctx := r.Context()
	if _, ok := auth.FromContext(ctx); !ok {
		writeErrorJSON(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body createMemoryBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.uc.SaveHouseholdAIMemoryForActor(ctx, body.Content, body.Scope); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
