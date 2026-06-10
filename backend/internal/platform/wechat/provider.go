package wechat

import (
	"os"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/google/wire"
)

// ProviderSet 提供 *wechat.Client，按 config.yaml `wechat.appid/secret` 优先、
// AICOOK_WX_APPID/AICOOK_WX_SECRET 环境变量回退、placeholder 视为未配置。
// 凭证缺失时返回 nil 客户端，由调用方（如 AuthService.WxLogin）做空判处理。
var ProviderSet = wire.NewSet(NewClientFromConfig)

func NewClientFromConfig(bc *conf.Bootstrap) *Client {
	appID := strings.TrimSpace(bc.GetWechat().GetAppid())
	secret := strings.TrimSpace(bc.GetWechat().GetSecret())
	if appID == "" {
		appID = strings.TrimSpace(os.Getenv("AICOOK_WX_APPID"))
	}
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("AICOOK_WX_SECRET"))
	}
	// placeholder 视为未配置
	if appID == "<APPID_HERE>" {
		appID = ""
	}
	if secret == "<SECRET_HERE>" {
		secret = ""
	}
	if appID == "" || secret == "" {
		return nil
	}
	return NewClient(appID, secret)
}
