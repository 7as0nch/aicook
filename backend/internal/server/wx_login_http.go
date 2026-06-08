package server

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/biz"
	"github.com/chengjiang/aicook/backend/internal/platform/wechat"
)

// WxLoginHandler 提供 /api/v1/auth/wx-login 端点，对接微信小程序 wx.login 后的 code → openid 流程。
//
// 配置：通过环境变量 AICOOK_WX_APPID + AICOOK_WX_SECRET 注入；缺失时返回 503。
type WxLoginHandler struct {
	auth   *biz.AuthUsecase
	client *wechat.Client
}

type wxLoginRequest struct {
	Code      string `json:"code"`
	Nickname  string `json:"nickname"`
	AvatarURL string `json:"avatar_url"`
}

type wxLoginReply struct {
	Token            string         `json:"token"`
	User             map[string]any `json:"user"`
	CurrentHousehold map[string]any `json:"current_household"`
	Households       []any          `json:"households"`
}

func NewWxLoginHandler(auth *biz.AuthUsecase) *WxLoginHandler {
	appID := strings.TrimSpace(os.Getenv("AICOOK_WX_APPID"))
	secret := strings.TrimSpace(os.Getenv("AICOOK_WX_SECRET"))
	var client *wechat.Client
	if appID != "" && secret != "" {
		client = wechat.NewClient(appID, secret)
	}
	return &WxLoginHandler{auth: auth, client: client}
}

func (h *WxLoginHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/wx-login", h.handleWxLogin)
}

func (h *WxLoginHandler) handleWxLogin(w http.ResponseWriter, r *http.Request) {
	if h.client == nil {
		writeErrorJSON(w, http.StatusServiceUnavailable, "wechat appid/secret not configured (set AICOOK_WX_APPID / AICOOK_WX_SECRET)")
		return
	}
	var req wxLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	session, err := h.client.Code2Session(ctx, req.Code)
	if err != nil {
		writeErrorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := h.auth.LoginByWx(ctx, session.OpenID, session.UnionID, req.Nickname, req.AvatarURL)
	if err != nil {
		writeErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	avatarAssetID := ""
	if result.User.AvatarAssetID != nil {
		avatarAssetID = strconv.FormatInt(*result.User.AvatarAssetID, 10)
	}
	reply := wxLoginReply{
		Token: result.Token,
		User: map[string]any{
			"id":                strconv.FormatInt(result.User.ID, 10),
			"household_id":      strconv.FormatInt(result.User.HouseholdID, 10),
			"username":          result.User.Username,
			"display_name":      result.User.DisplayName,
			"phone":             result.User.Phone,
			"email":             result.User.Email,
			"status":            result.User.Status,
			"avatar_asset_id":   avatarAssetID,
		},
		CurrentHousehold: map[string]any{
			"id":         strconv.FormatInt(result.CurrentHousehold.ID, 10),
			"name":       result.CurrentHousehold.Name,
			"share_code": result.CurrentHousehold.ShareCode,
			"timezone":   result.CurrentHousehold.Timezone,
		},
		Households: make([]any, 0, len(result.Households)),
	}
	for _, h := range result.Households {
		reply.Households = append(reply.Households, map[string]any{
			"id":         strconv.FormatInt(h.ID, 10),
			"name":       h.Name,
			"share_code": h.ShareCode,
			"timezone":   h.Timezone,
		})
	}
	writeJSON(w, reply)
}
