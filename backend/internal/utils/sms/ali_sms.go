/* *
 * @Author: chengjiang
 * @Date: 2026-03-17 13:59:56
 * @Description: 阿里云短信实现
**/
package sms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	dysmsapi "github.com/alibabacloud-go/dysmsapi-20170525/v5/client"
	"github.com/alibabacloud-go/tea/tea"
	util "github.com/alibabacloud-go/tea-utils/v2/service"
	credential "github.com/aliyun/credentials-go/credentials"
)

// config

type aliyunProvider struct {
	cfg AliyunConfig
}

func newAliyunProvider(cfg AliyunConfig) Provider {
	return &aliyunProvider{cfg: cfg}
}

func (p *aliyunProvider) Send(ctx context.Context, req *Request) error {
	signName := req.SignName
	if signName == "" {
		signName = p.cfg.SignName
	}
	templateCode := req.TemplateCode
	if templateCode == "" {
		templateCode = p.cfg.TemplateCode
	}
	if templateCode == "" || signName == "" {
		return errors.New("aliyun sms sign name or template code is empty")
	}

	cred, err := createAliyunCredential(p.cfg)
	if err != nil {
		return fmt.Errorf("create aliyun credential failed: %w", err)
	}

	config := &openapi.Config{
		Credential: cred,
	}
	endpoint := p.cfg.Endpoint
	if endpoint == "" {
		endpoint = "dysmsapi.aliyuncs.com"
	}
	config.Endpoint = tea.String(endpoint)
	if p.cfg.RegionID != "" {
		config.RegionId = tea.String(p.cfg.RegionID)
	}
	client, err := dysmsapi.NewClient(config)
	if err != nil {
		return fmt.Errorf("create aliyun sms client failed: %w", err)
	}

	sendReq := &dysmsapi.SendSmsRequest{
		PhoneNumbers:  tea.String(req.PhoneNumber),
		SignName:      tea.String(signName),
		TemplateCode:  tea.String(templateCode),
		TemplateParam: tea.String(req.TemplateParams),
	}
	runtime := &util.RuntimeOptions{}
	resp, err := client.SendSmsWithOptions(sendReq, runtime)
	if err != nil {
		msg := parseAliyunSDKErrorMessage(err)
		return fmt.Errorf("aliyun send sms failed: %s", msg)
	}
	if resp.Body == nil {
		return errors.New("aliyun send sms response body is nil")
	}
	code := tea.StringValue(resp.Body.Code)
	if code != "OK" {
		return fmt.Errorf("aliyun send sms failed, code=%s, message=%s", code, tea.StringValue(resp.Body.Message))
	}
	_ = ctx
	return nil
}

func createAliyunCredential(cfg AliyunConfig) (credential.Credential, error) {
	if cfg.AccessKeyID != "" && cfg.AccessKeySecret != "" {
		return credential.NewCredential(&credential.Config{
			Type:            tea.String("access_key"),
			AccessKeyId:     tea.String(cfg.AccessKeyID),
			AccessKeySecret: tea.String(cfg.AccessKeySecret),
		})
	}
	return credential.NewCredential(nil)
}

func parseAliyunSDKErrorMessage(err error) string {
	sdkErr := &tea.SDKError{}
	if t, ok := err.(*tea.SDKError); ok {
		sdkErr = t
	} else {
		sdkErr.Message = tea.String(err.Error())
	}
	msg := tea.StringValue(sdkErr.Message)
	if sdkErr.Data == nil {
		return msg
	}

	var data map[string]any
	raw := tea.StringValue(sdkErr.Data)
	if raw == "" {
		return msg
	}
	if json.NewDecoder(strings.NewReader(raw)).Decode(&data) == nil {
		if recommend, ok := data["Recommend"]; ok && recommend != nil {
			return fmt.Sprintf("%s (recommend: %v)", msg, recommend)
		}
	}
	return msg
}
