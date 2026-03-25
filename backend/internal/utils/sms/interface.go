/* *
 * @Author: chengjiang
 * @Date: 2026-03-17 13:59:37
 * @Description: 
**/
package sms

import (
	"context"
	"errors"
	"fmt"
)

type Request struct {
	PhoneNumber    string
	TemplateCode   string
	TemplateParams string
	SignName       string
}

type AliyunConfig struct {
	AccessKeyID     string `json:"access_key_id"`
	AccessKeySecret string `json:"access_key_secret"`
	Endpoint        string `json:"endpoint"`
	RegionID        string `json:"region_id"`
	SignName        string `json:"sign_name"`
	TemplateCode    string `json:"template_code"`
}

type Provider interface {
	Send(ctx context.Context, req *Request) error
}

type Client struct {
	provider Provider
}

type SMSChannel string

const (
	SMSChannelAli SMSChannel = "aliyun"
)

func NewClientWithConfig(channel SMSChannel, cfg AliyunConfig) (*Client, error) {
	switch channel {
	case SMSChannelAli:
		return &Client{
			provider: newAliyunProvider(cfg),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported sms channel: %s", channel)
	}
}

func (c *Client) Send(ctx context.Context, req *Request) error {
	if c == nil {
		return errors.New("sms client is nil")
	}
	if c.provider == nil {
		return errors.New("sms provider is not initialized")
	}
	if req == nil {
		return errors.New("sms request is nil")
	}
	if req.PhoneNumber == "" {
		return errors.New("phone number is required")
	}
	return c.provider.Send(ctx, req)
}

