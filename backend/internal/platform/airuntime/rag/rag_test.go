package rag

import (
	"archive/zip"
	"bytes"
	"testing"
	"unicode/utf8"
)

func TestExtractTextDOCX(t *testing.T) {
	payload := buildDOCX(t, map[string]string{
		"word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>`,
	})
	result, err := ExtractText("application/octet-stream", "demo.docx", payload)
	if err != nil {
		t.Fatalf("ExtractText returned error: %v", err)
	}
	if result.Unsupported {
		t.Fatalf("expected docx to be supported")
	}
	if result.EffectiveContentType != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
		t.Fatalf("unexpected content type: %s", result.EffectiveContentType)
	}
	if got := result.TextContent; got == "" || got != "第一段\n第二段" {
		t.Fatalf("unexpected docx text: %q", got)
	}
}

func TestExtractTextDOCUnsupported(t *testing.T) {
	result, err := ExtractText("application/octet-stream", "legacy.doc", []byte("binary"))
	if err != nil {
		t.Fatalf("ExtractText returned error: %v", err)
	}
	if !result.Unsupported {
		t.Fatalf("expected .doc to be unsupported")
	}
	if result.UnsupportedReason == "" {
		t.Fatalf("expected unsupported reason")
	}
}

func TestSplitTextKeepsOverlap(t *testing.T) {
	text := "第一段说明火候。\n第二段说明步骤。\n第三段说明收汁。\n第四段说明装盘。"
	chunks, err := SplitText(text, SplitConfig{ChunkSize: 14, Overlap: 4}, map[string]any{"title": "测试"})
	if err != nil {
		t.Fatalf("SplitText returned error: %v", err)
	}
	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks, got %d", len(chunks))
	}
	if chunks[0].No != 1 || chunks[1].No != 2 {
		t.Fatalf("unexpected chunk numbering: %+v", chunks)
	}
	if chunks[0].Metadata["title"] != "测试" {
		t.Fatalf("expected metadata to be preserved")
	}
	if chunks[1].TokenSize == 0 || chunks[1].Snippet == "" {
		t.Fatalf("expected snippet and token size to be filled")
	}
}

func TestNormalizeExtractedTextStripsProblemRunes(t *testing.T) {
	raw := "\u0007" + string(utf8.RuneError) + "第一行\x00\r\n第二行\u200b\r第三行\u0003"
	got := normalizeExtractedText(raw)
	want := "第一行\n第二行\n第三行"
	if got != want {
		t.Fatalf("unexpected normalized text: got %q want %q", got, want)
	}
}

func buildDOCX(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("Create zip entry failed: %v", err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatalf("Write zip entry failed: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("Close zip failed: %v", err)
	}
	return buf.Bytes()
}
