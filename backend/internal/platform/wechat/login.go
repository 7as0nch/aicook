package wechat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Code2SessionReply 是微信 jscode2session 接口返回的结构。
type Code2SessionReply struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid,omitempty"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

// Client 封装微信小程序服务端 API 调用。
type Client struct {
	AppID  string
	Secret string
	HTTP   *http.Client
}

func NewClient(appID, secret string) *Client {
	return &Client{
		AppID:  strings.TrimSpace(appID),
		Secret: strings.TrimSpace(secret),
		HTTP:   &http.Client{Timeout: 10 * time.Second},
	}
}

// Code2Session 通过 wx.login 拿到的 code 换取 openid + session_key。
func (c *Client) Code2Session(ctx context.Context, code string) (*Code2SessionReply, error) {
	if c.AppID == "" || c.Secret == "" {
		return nil, fmt.Errorf("wechat: appid/secret not configured")
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, fmt.Errorf("wechat: code is required")
	}
	q := url.Values{}
	q.Set("appid", c.AppID)
	q.Set("secret", c.Secret)
	q.Set("js_code", code)
	q.Set("grant_type", "authorization_code")
	endpoint := "https://api.weixin.qq.com/sns/jscode2session?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wechat: code2session http: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var reply Code2SessionReply
	if err := json.Unmarshal(body, &reply); err != nil {
		return nil, fmt.Errorf("wechat: code2session decode: %w; raw=%s", err, string(body))
	}
	if reply.ErrCode != 0 {
		return nil, fmt.Errorf("wechat: code2session errcode=%d errmsg=%s", reply.ErrCode, reply.ErrMsg)
	}
	if strings.TrimSpace(reply.OpenID) == "" {
		return nil, fmt.Errorf("wechat: code2session missing openid; raw=%s", string(body))
	}
	return &reply, nil
}
