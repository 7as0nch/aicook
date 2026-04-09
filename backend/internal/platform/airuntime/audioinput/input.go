package audioinput

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"time"

	"github.com/cloudwego/eino/schema"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

const maxAudioBodyBytes = 15 << 20
const maxTranscodedWAVBytes = 25 << 20

var audioHTTPClient = &http.Client{Timeout: 45 * time.Second}

// MediaHostAllowlist 提取允许直接拉取语音文件的 OSS 域名白名单。
func MediaHostAllowlist(oss *conf.OSS) map[string]struct{} {
	out := make(map[string]struct{})
	if oss == nil {
		return out
	}
	add := func(raw string) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		if !strings.Contains(raw, "://") {
			raw = "http://" + raw
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return
		}
		out[strings.ToLower(u.Host)] = struct{}{}
	}
	add(oss.GetEndpoint())
	add(oss.GetPublicEndpoint())
	return out
}

// BuildInputPart 拉取并标准化语音文件，生成 OpenAI 兼容 audio part。
func BuildInputPart(ctx context.Context, rawURL, contentType string, allow map[string]struct{}) (schema.MessageInputPart, error) {
	body, mime, err := fetchAudioBytes(ctx, rawURL, allow, contentType)
	if err != nil {
		return schema.MessageInputPart{}, err
	}
	body, mime, err = ensureEinoOpenAIAudioPayload(ctx, body, mime)
	if err != nil {
		return schema.MessageInputPart{}, err
	}
	b64 := base64.StdEncoding.EncodeToString(body)
	return schema.MessageInputPart{
		Type: schema.ChatMessagePartTypeAudioURL,
		Audio: &schema.MessageInputAudio{
			MessagePartCommon: schema.MessagePartCommon{
				Base64Data: &b64,
				MIMEType:   mime,
			},
		},
	}, nil
}

func audioURLHostAllowed(rawURL string, allow map[string]struct{}) bool {
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

var einoOpenAIAudioMIMEKeys = map[string]struct{}{
	"audio/wav":      {},
	"audio/vnd.wav":  {},
	"audio/vnd.wave": {},
	"audio/wave":     {},
	"audio/x-pn-wav": {},
	"audio/mpeg":     {},
	"audio/x-wav":    {},
	"audio/mpeg3":    {},
	"audio/x-mpeg-3": {},
}

func normalizeAudioMIMEKey(raw string) string {
	raw = strings.TrimSpace(raw)
	if i := strings.Index(raw, ";"); i >= 0 {
		raw = raw[:i]
	}
	return strings.ToLower(strings.TrimSpace(raw))
}

func fetchAudioBytes(ctx context.Context, rawURL string, allow map[string]struct{}, fallbackMIME string) (body []byte, mime string, err error) {
	if !audioURLHostAllowed(rawURL, allow) {
		return nil, "", fmt.Errorf("语音文件地址不在允许的存储域名内，无法入模（请检查 OSS 配置与 URL）")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("fetch audio: %w", err)
	}
	resp, err := audioHTTPClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("拉取语音失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("拉取语音失败: HTTP %s", resp.Status)
	}
	ct := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if ct == "" {
		ct = strings.TrimSpace(fallbackMIME)
	}
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}

	lr := io.LimitReader(resp.Body, maxAudioBodyBytes+1)
	body, err = io.ReadAll(lr)
	if err != nil {
		return nil, "", fmt.Errorf("读取语音数据失败: %w", err)
	}
	if len(body) > maxAudioBodyBytes {
		return nil, "", fmt.Errorf("语音文件过大（最大 %dMB）", maxAudioBodyBytes>>20)
	}
	if len(body) == 0 {
		return nil, "", fmt.Errorf("语音文件为空")
	}
	return body, ct, nil
}

func transcodeToWAVPCM(ctx context.Context, in []byte) ([]byte, error) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		return nil, fmt.Errorf("浏览器录音多为 WebM，需在服务器安装 ffmpeg 并加入 PATH 以转换为 WAV 后再入模；也可改用 WAV/MP3 上传")
	}
	//nolint:gosec // argv 固定，stdin 仅为已上传的音频字节。
	cmd := exec.CommandContext(ctx, ffmpeg,
		"-hide_banner", "-loglevel", "error",
		"-i", "pipe:0",
		"-map", "0:a:0?",
		"-f", "wav",
		"-acodec", "pcm_s16le",
		"-ar", "16000",
		"-ac", "1",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(in)
	var out bytes.Buffer
	cmd.Stdout = &out
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return nil, fmt.Errorf("ffmpeg 转换失败: %w: %s", err, msg)
		}
		return nil, fmt.Errorf("ffmpeg 转换失败: %w", err)
	}
	if out.Len() == 0 {
		return nil, fmt.Errorf("ffmpeg 未输出 WAV 数据")
	}
	if out.Len() > maxTranscodedWAVBytes {
		return nil, fmt.Errorf("转换后 WAV 过大（最大 %dMB）", maxTranscodedWAVBytes>>20)
	}
	return out.Bytes(), nil
}

func ensureEinoOpenAIAudioPayload(ctx context.Context, data []byte, mime string) ([]byte, string, error) {
	key := normalizeAudioMIMEKey(mime)
	if key != "" {
		if _, ok := einoOpenAIAudioMIMEKeys[key]; ok {
			return data, key, nil
		}
	}
	wav, err := transcodeToWAVPCM(ctx, data)
	if err != nil {
		return nil, "", err
	}
	return wav, "audio/wav", nil
}
