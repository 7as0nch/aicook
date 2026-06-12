package imageinput

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// 关键回归：图片必须被后端拉取并 base64 内联（Base64Data 有值、URL 为空），
// 而不是把内网/HTTP 的存储 URL 交给 MiMo 云端拉取（那会 400 Param Incorrect）。
func TestBuildInputPartInlinesBase64(t *testing.T) {
	imgBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46} // JPEG 魔数片段
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(imgBytes)
	}))
	defer srv.Close()

	allow := map[string]struct{}{mustHost(t, srv.URL): {}}

	part, err := BuildInputPart(context.Background(), srv.URL+"/aicook-media/x.jpg", "image/jpeg", allow)
	if err != nil {
		t.Fatalf("BuildInputPart err: %v", err)
	}
	if part.Image == nil {
		t.Fatal("expected an image part")
	}
	if part.Image.URL != nil {
		t.Fatalf("expected NO external URL (must inline base64), got %q", *part.Image.URL)
	}
	if part.Image.Base64Data == nil || *part.Image.Base64Data == "" {
		t.Fatal("expected base64 data to be set")
	}
	if !strings.HasPrefix(part.Image.MIMEType, "image/") {
		t.Fatalf("expected image/* mime, got %q", part.Image.MIMEType)
	}
}

func TestBuildInputPartRejectsDisallowedHost(t *testing.T) {
	_, err := BuildInputPart(context.Background(), "http://evil.example.com/x.jpg", "image/jpeg", map[string]struct{}{"ok.example.com": {}})
	if err == nil {
		t.Fatal("expected error for host not in allowlist")
	}
}

func mustHost(t *testing.T, raw string) string {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	return strings.ToLower(u.Host)
}
