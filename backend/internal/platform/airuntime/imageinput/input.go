package imageinput

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cloudwego/eino/schema"
)

// 原图上限 10MB（base64 后约 13MB）。MiMo 多模态对单次入参体积有限制，过大直接拒绝。
const maxImageBodyBytes = 10 << 20

var imageHTTPClient = &http.Client{Timeout: 30 * time.Second}

// BuildInputPart 由后端先把图片拉成字节再 base64 内联，而不是把图片 URL 交给 MiMo 云端自行拉取。
// 原因与语音入模一致：对象存储多为内网/HTTP 的 MinIO，MiMo 云端拉不到（表现为 400 Param Incorrect）；
// 后端在内网可达，拉好字节内联给模型最稳。
func BuildInputPart(ctx context.Context, rawURL, contentType string, allow map[string]struct{}) (schema.MessageInputPart, error) {
	body, mime, err := fetchImageBytes(ctx, rawURL, allow, contentType)
	if err != nil {
		return schema.MessageInputPart{}, err
	}
	b64 := base64.StdEncoding.EncodeToString(body)
	return schema.MessageInputPart{
		Type: schema.ChatMessagePartTypeImageURL,
		Image: &schema.MessageInputImage{
			MessagePartCommon: schema.MessagePartCommon{
				Base64Data: &b64,
				MIMEType:   mime,
			},
		},
	}, nil
}

func imageURLHostAllowed(rawURL string, allow map[string]struct{}) bool {
	if len(allow) == 0 {
		return false
	}
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" {
		return false
	}
	if sch := strings.ToLower(u.Scheme); sch != "http" && sch != "https" {
		return false
	}
	_, ok := allow[strings.ToLower(u.Host)]
	return ok
}

// normalizeImageMIME 取响应头 Content-Type，缺失时回退附件声明，最终保证是 image/* 类型。
func normalizeImageMIME(raw, fallback string) string {
	pick := strings.TrimSpace(raw)
	if pick == "" {
		pick = strings.TrimSpace(fallback)
	}
	if i := strings.Index(pick, ";"); i >= 0 {
		pick = strings.TrimSpace(pick[:i])
	}
	pick = strings.ToLower(pick)
	if !strings.HasPrefix(pick, "image/") {
		return "image/jpeg"
	}
	return pick
}

func fetchImageBytes(ctx context.Context, rawURL string, allow map[string]struct{}, fallbackMIME string) ([]byte, string, error) {
	if !imageURLHostAllowed(rawURL, allow) {
		return nil, "", fmt.Errorf("图片地址不在允许的存储域名内，无法入模（请检查 OSS 配置与 URL）")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("fetch image: %w", err)
	}
	resp, err := imageHTTPClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("拉取图片失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("拉取图片失败: HTTP %s", resp.Status)
	}
	mime := normalizeImageMIME(resp.Header.Get("Content-Type"), fallbackMIME)
	lr := io.LimitReader(resp.Body, maxImageBodyBytes+1)
	body, err := io.ReadAll(lr)
	if err != nil {
		return nil, "", fmt.Errorf("读取图片数据失败: %w", err)
	}
	if len(body) > maxImageBodyBytes {
		return nil, "", fmt.Errorf("图片过大（最大 %dMB）", maxImageBodyBytes>>20)
	}
	if len(body) == 0 {
		return nil, "", fmt.Errorf("图片为空")
	}
	return body, mime, nil
}
