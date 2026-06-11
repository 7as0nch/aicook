// Package asr 提供基于小米 MiMo 语音识别模型（mimo-v2.5-asr）的语音转写。
// MiMo 的 ASR 走 OpenAI 兼容的 /chat/completions：把音频以 data URL（base64）
// 放进 input_audio 内容段，模型把识别文本作为 assistant message.content 返回。
// 取代原 inference-service 的 FunASR：与 chat/vision 共用同一套 api_key/base_url。
package asr

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

const (
	defaultBaseURL  = "https://api.xiaomimimo.com/v1"
	defaultASRModel = "mimo-v2.5-asr"
	// MiMo 限制 base64 后 ≤10MB；这里按原始字节留出 base64 膨胀（4/3）后的安全上限。
	maxAudioBytes = 7 * 1024 * 1024
)

// FilePayload 与原 inference.FilePayload 同形，便于平滑替换。
type FilePayload struct {
	FileName    string
	ContentType string
	Data        []byte
}

// SpeechSegment / SpeechResult 保持与旧 inference 包同形的字段，
// 这样 service/voice.go 与 biz 层无需改动（MiMo 仅返回整段文本，
// 分段/置信度留空）。
type SpeechSegment struct {
	StartMS int64   `json:"start_ms"`
	EndMS   int64   `json:"end_ms"`
	Text    string  `json:"text"`
	Score   float64 `json:"score"`
}

type SpeechResult struct {
	Text       string          `json:"text"`
	Confidence float64         `json:"confidence"`
	Segments   []SpeechSegment `json:"segments"`
}

type Client struct {
	baseURL    string
	apiKey     string
	model      string
	httpClient *http.Client
}

func NewClient(cfg *conf.AI) *Client {
	baseURL := defaultBaseURL
	apiKey := ""
	model := defaultASRModel
	if cfg != nil {
		if v := strings.TrimSpace(cfg.GetBaseUrl()); v != "" {
			baseURL = v
		}
		apiKey = strings.TrimSpace(cfg.GetApiKey())
		if v := strings.TrimSpace(cfg.GetAsrModel()); v != "" {
			model = v
		}
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		model:   model,
		// 转写短音频，给一个有界超时即可（与长文本生成不同，不会被流式拖长）。
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// chat/completions 请求/响应（仅取所需字段）。
type chatAudioPart struct {
	Type       string         `json:"type"`
	InputAudio map[string]any `json:"input_audio,omitempty"`
}

type chatMessage struct {
	Role    string          `json:"role"`
	Content []chatAudioPart `json:"content"`
}

type chatRequest struct {
	Model      string         `json:"model"`
	Messages   []chatMessage  `json:"messages"`
	ASROptions map[string]any `json:"asr_options,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			// content 可能是字符串，也可能是数组（多模态）；用 RawMessage 兜底解析。
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) Transcribe(ctx context.Context, file FilePayload) (*SpeechResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("asr: api key 未配置")
	}
	if len(file.Data) == 0 {
		return nil, fmt.Errorf("asr: 音频内容为空")
	}
	if len(file.Data) > maxAudioBytes {
		return nil, fmt.Errorf("asr: 音频过大（%d 字节），请缩短录音时长", len(file.Data))
	}

	mime := audioMIME(file.ContentType, file.FileName)
	dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(file.Data)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{{
			Role: "user",
			Content: []chatAudioPart{{
				Type:       "input_audio",
				InputAudio: map[string]any{"data": dataURL},
			}},
		}},
		ASROptions: map[string]any{"language": "zh"},
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	// 同时带 Bearer 与 api-key，兼容 OpenAI 风格与 MiMo 文档示例两种鉴权头。
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("api-key", c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("asr 请求失败(%d): %s", resp.StatusCode, string(body))
	}

	var parsed chatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("asr 响应解析失败: %w", err)
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return nil, fmt.Errorf("asr 服务返回错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("asr 未返回识别结果")
	}

	text := extractContentText(parsed.Choices[0].Message.Content)
	return &SpeechResult{Text: strings.TrimSpace(text)}, nil
}

// audioMIME 依据上传的 content-type / 文件名推断 MiMo 接受的 MIME（仅 wav / mp3）。
func audioMIME(contentType, fileName string) string {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	name := strings.ToLower(strings.TrimSpace(fileName))
	if strings.Contains(ct, "wav") || strings.HasSuffix(name, ".wav") {
		return "audio/wav"
	}
	// 默认按 mp3（微信 getRecorderManager 默认录 mp3）。
	return "audio/mpeg"
}

// extractContentText 兼容 content 为字符串或多模态数组两种形态。
func extractContentText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err == nil {
		var b strings.Builder
		for _, p := range parts {
			b.WriteString(p.Text)
		}
		return b.String()
	}
	return ""
}
