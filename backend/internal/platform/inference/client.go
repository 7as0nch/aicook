package inference

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"time"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

type FilePayload struct {
	FileName    string
	ContentType string
	Data        []byte
}

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

type OCRBlock struct {
	Text       string  `json:"text"`
	Confidence float64 `json:"confidence"`
	BBox       []int   `json:"bbox"`
}

type OCRPage struct {
	PageNo     int        `json:"page_no"`
	Text       string     `json:"text"`
	Confidence float64    `json:"confidence"`
	Blocks     []OCRBlock `json:"blocks"`
}

type OCRResult struct {
	Pages []OCRPage `json:"pages"`
	Text  string    `json:"text"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(cfg *conf.Inference) *Client {
	timeout := cfg.GetTimeout().AsDuration()
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Client{
		baseURL: cfg.GetEndpoint(),
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) Transcribe(ctx context.Context, file FilePayload) (*SpeechResult, error) {
	var result SpeechResult
	if err := c.postMultipart(ctx, "/v1/speech/transcriptions", []FilePayload{file}, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) OCR(ctx context.Context, files []FilePayload) (*OCRResult, error) {
	var result OCRResult
	if err := c.postMultipart(ctx, "/v1/vision/ocr", files, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) postMultipart(ctx context.Context, path string, files []FilePayload, form map[string]string, out any) error {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	for key, value := range form {
		if err := writer.WriteField(key, value); err != nil {
			return err
		}
	}

	for _, file := range files {
		part, err := writer.CreateFormFile("files", filepath.Base(file.FileName))
		if err != nil {
			return err
		}
		if _, err := part.Write(file.Data); err != nil {
			return err
		}
	}

	if err := writer.Close(); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		payload, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("inference request failed: %s", string(payload))
	}

	return json.NewDecoder(resp.Body).Decode(out)
}
