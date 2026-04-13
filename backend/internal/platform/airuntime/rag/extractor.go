package rag

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
)

const defaultPDFExtractTimeout = 5 * time.Minute

var errPDFPageTimeout = errors.New("pdf page extract timeout")

// EffectiveContentTypeForExtract 在浏览器上传给出 octet-stream 时，用内容与扩展名尽量恢复真实类型。
func EffectiveContentTypeForExtract(declared, fileName string, payload []byte) string {
	ct := strings.TrimSpace(declared)
	lower := strings.ToLower(ct)
	needsGuess := lower == "" ||
		lower == "application/octet-stream" ||
		lower == "binary/octet-stream" ||
		lower == "application/x-msdownload"
	if !needsGuess {
		return ct
	}
	if len(payload) >= 4 && bytes.HasPrefix(payload, []byte("%PDF")) {
		return "application/pdf"
	}
	ext := strings.ToLower(filepath.Ext(fileName))
	switch ext {
	case ".pdf":
		return "application/pdf"
	case ".txt", ".md", ".markdown", ".log", ".csv":
		return "text/plain; charset=utf-8"
	case ".json":
		return "application/json"
	case ".xml":
		return "application/xml"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".doc":
		return "application/msword"
	}
	const maxTextHeuristic = 512 * 1024
	if len(payload) > 0 && len(payload) <= maxTextHeuristic && utf8.Valid(payload) && mostlyPrintableTextPayload(payload) {
		return "text/plain; charset=utf-8"
	}
	return ct
}

func ExtractText(contentType, fileName string, payload []byte) (ExtractResult, error) {
	return ExtractTextWithOptions(contentType, fileName, payload, ExtractOptions{})
}

func ExtractTextWithOptions(contentType, fileName string, payload []byte, opts ExtractOptions) (ExtractResult, error) {
	effectiveCT := EffectiveContentTypeForExtract(contentType, fileName, payload)
	result := ExtractResult{
		EffectiveContentType: effectiveCT,
		Stats: ExtractStats{
			Extractor: "airuntime/rag",
		},
	}
	lower := strings.ToLower(strings.TrimSpace(effectiveCT))

	switch {
	case strings.Contains(lower, "text/plain"),
		strings.Contains(lower, "text/markdown"),
		strings.Contains(lower, "application/json"),
		strings.Contains(lower, "application/xml"):
		result.TextContent = normalizeExtractedText(string(payload))
		return result, nil
	case strings.Contains(lower, "pdf"):
		timeout := opts.Timeout
		if timeout <= 0 {
			timeout = defaultPDFExtractTimeout
		}
		text, stats, err := extractPDFPlainTextSegmentWithTimeout(payload, opts.PDFStartPage, timeout)
		result.Stats = stats
		if err != nil {
			return result, err
		}
		result.TextContent = normalizeExtractedText(text)
		return result, nil
	case strings.Contains(lower, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"):
		text, err := extractDOCXPlainText(payload)
		if err != nil {
			return result, err
		}
		result.TextContent = normalizeExtractedText(text)
		return result, nil
	case strings.Contains(lower, "application/msword") || strings.EqualFold(strings.ToLower(filepath.Ext(fileName)), ".doc"):
		result.Unsupported = true
		result.UnsupportedReason = "暂不支持旧版 .doc，请另存为 .docx 或导出为 PDF/Markdown 后上传。"
		return result, nil
	default:
		result.Unsupported = true
		result.UnsupportedReason = fmt.Sprintf("暂不支持该文件类型（%s），请上传 PDF、TXT、Markdown、JSON、XML 或 DOCX。", nonEmpty(effectiveCT, strings.ToLower(filepath.Ext(fileName))))
		return result, nil
	}
}

func mostlyPrintableTextPayload(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	bad := 0
	for _, c := range b {
		if c == '\n' || c == '\r' || c == '\t' {
			continue
		}
		if c < 32 || c == 127 {
			bad++
		}
	}
	return float64(bad)/float64(len(b)) < 0.03
}

func extractPDFPlainText(data []byte) string {
	r := bytes.NewReader(data)
	reader, err := pdf.NewReader(r, int64(len(data)))
	if err != nil {
		return ""
	}
	pr, err := reader.GetPlainText()
	if err != nil {
		return ""
	}
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(pr); err != nil {
		return ""
	}
	return strings.TrimSpace(buf.String())
}

func extractPDFPlainTextWithTimeout(data []byte, timeout time.Duration) (string, ExtractStats, error) {
	return extractPDFPlainTextSegmentWithTimeout(data, 1, timeout)
}

func extractPDFPlainTextSegmentWithTimeout(data []byte, startPage int, timeout time.Duration) (string, ExtractStats, error) {
	stats := ExtractStats{
		Extractor: "pdf_page_split",
	}
	start := time.Now()
	defer func() {
		stats.DurationMS = time.Since(start).Milliseconds()
	}()

	readerAt := bytes.NewReader(data)
	reader, err := pdf.NewReader(readerAt, int64(len(data)))
	if err != nil {
		stats.ErrorKind = "pdf_open_failed"
		stats.StopReason = "reader_init_failed"
		stats.LastError = err.Error()
		return "", stats, fmt.Errorf("打开 pdf 失败: %w", err)
	}

	stats.PageCount = reader.NumPage()
	if startPage <= 0 {
		startPage = 1
	}
	stats.StartPage = startPage
	if stats.PageCount == 0 {
		stats.Completed = true
		return "", stats, nil
	}
	if startPage > stats.PageCount {
		stats.NextPage = stats.PageCount + 1
		stats.Completed = true
		return "", stats, nil
	}
	fonts := make(map[string]*pdf.Font)
	var buf strings.Builder
	deadline := time.Time{}
	if timeout > 0 {
		deadline = start.Add(timeout)
	}

	for pageNo := startPage; pageNo <= stats.PageCount; pageNo++ {
		if !deadline.IsZero() && time.Now().After(deadline) {
			stats.ErrorKind = "extract_timeout"
			stats.StopReason = "deadline_exceeded"
			stats.Partial = stats.PagesSucceeded > 0
			stats.NextPage = pageNo
			break
		}

		page := reader.Page(pageNo)
		if page.V.IsNull() {
			stats.PagesProcessed++
			stats.PagesFailed++
			stats.LastPage = pageNo
			stats.NextPage = pageNo + 1
			stats.ErrorKind = nonEmpty(stats.ErrorKind, "pdf_page_error")
			stats.StopReason = nonEmpty(stats.StopReason, "page_missing")
			stats.LastError = fmt.Sprintf("第 %d 页为空", pageNo)
			continue
		}
		for _, name := range page.Fonts() {
			if _, ok := fonts[name]; ok {
				continue
			}
			font := page.Font(name)
			fonts[name] = &font
		}

		remaining := timeout
		if !deadline.IsZero() {
			remaining = time.Until(deadline)
			if remaining <= 0 {
				stats.ErrorKind = "extract_timeout"
				stats.StopReason = "deadline_exceeded"
				stats.Partial = stats.PagesSucceeded > 0
				stats.NextPage = pageNo
				break
			}
		}
		pageText, pageErr := extractPDFPagePlainTextWithTimeout(page, fonts, remaining)
		stats.PagesProcessed++
		stats.LastPage = pageNo
		if pageErr != nil {
			stats.PagesFailed++
			stats.LastError = pageErr.Error()
			if errors.Is(pageErr, errPDFPageTimeout) {
				stats.ErrorKind = "extract_timeout"
				stats.StopReason = "page_timeout"
				stats.Partial = stats.PagesSucceeded > 0
				stats.NextPage = pageNo
				break
			}
			stats.ErrorKind = nonEmpty(stats.ErrorKind, "pdf_page_error")
			stats.StopReason = nonEmpty(stats.StopReason, "page_error")
			stats.NextPage = pageNo + 1
			continue
		}

		stats.PagesSucceeded++
		stats.NextPage = pageNo + 1
		pageText = strings.TrimSpace(pageText)
		if pageText == "" {
			continue
		}
		if buf.Len() > 0 {
			buf.WriteString("\n")
		}
		buf.WriteString(pageText)
	}

	text := normalizeExtractedText(buf.String())
	if stats.PagesSucceeded > 0 && (stats.PagesFailed > 0 || stats.ErrorKind == "extract_timeout") {
		stats.Partial = true
	}
	if stats.ErrorKind == "" {
		stats.Completed = true
		stats.NextPage = stats.PageCount + 1
	} else if stats.NextPage == 0 {
		stats.NextPage = stats.LastPage + 1
	}
	if stats.ErrorKind == "extract_timeout" && text == "" {
		return "", stats, fmt.Errorf("pdf 文本解析超时（%s）", timeout)
	}
	if text == "" && stats.PagesFailed > 0 {
		return "", stats, fmt.Errorf("pdf 页面解析失败：%s", nonEmpty(stats.LastError, "未知错误"))
	}
	return text, stats, nil
}

func extractPDFPagePlainTextWithTimeout(page pdf.Page, fonts map[string]*pdf.Font, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		return page.GetPlainText(fonts)
	}
	type pageResult struct {
		text string
		err  error
	}
	ch := make(chan pageResult, 1)
	go func() {
		text, err := page.GetPlainText(fonts)
		ch <- pageResult{text: text, err: err}
	}()
	select {
	case result := <-ch:
		return result.text, result.err
	case <-time.After(timeout):
		return "", errPDFPageTimeout
	}
}

func extractDOCXPlainText(data []byte) (string, error) {
	readerAt := bytes.NewReader(data)
	zr, err := zip.NewReader(readerAt, int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("打开 docx 失败: %w", err)
	}
	parts := []string{"word/document.xml", "word/footnotes.xml", "word/endnotes.xml", "word/comments.xml"}
	texts := make([]string, 0, len(parts))
	for _, name := range parts {
		text, err := readDOCXXMLText(zr, name)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(text) != "" {
			texts = append(texts, text)
		}
	}
	return normalizeExtractedText(strings.Join(texts, "\n\n")), nil
}

func readDOCXXMLText(zr *zip.Reader, fileName string) (string, error) {
	for _, f := range zr.File {
		if !strings.EqualFold(f.Name, fileName) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", fmt.Errorf("打开 %s 失败: %w", fileName, err)
		}
		defer rc.Close()
		payload, err := io.ReadAll(rc)
		if err != nil {
			return "", fmt.Errorf("读取 %s 失败: %w", fileName, err)
		}
		return extractDOCXXMLString(payload)
	}
	return "", nil
}

func extractDOCXXMLString(payload []byte) (string, error) {
	decoder := xml.NewDecoder(bytes.NewReader(payload))
	var b strings.Builder
	for {
		tok, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", fmt.Errorf("解析 docx xml 失败: %w", err)
		}
		switch se := tok.(type) {
		case xml.StartElement:
			switch se.Name.Local {
			case "p", "br", "tab":
				b.WriteString("\n")
			}
		case xml.CharData:
			b.WriteString(string(se))
		}
	}
	return normalizeExtractedText(b.String()), nil
}

func normalizeExtractedText(raw string) string {
	raw = string(bytes.ToValidUTF8([]byte(raw), []byte{}))
	raw = stripProblemRunes(raw)
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	raw = regexp.MustCompile(`\n{3,}`).ReplaceAllString(raw, "\n\n")
	return strings.TrimSpace(raw)
}

// stripProblemRunes 清理 PDF 抽取里常见的控制字符、替换字符和零宽字符，避免脏字节继续流入 chunk/content。
func stripProblemRunes(raw string) string {
	if raw == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(raw))
	for _, r := range raw {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			b.WriteRune(r)
		case r == utf8.RuneError:
			continue
		case unicode.IsControl(r):
			continue
		case r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff':
			continue
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func nonEmpty(primary, fallback string) string {
	if strings.TrimSpace(primary) != "" {
		return strings.TrimSpace(primary)
	}
	return strings.TrimSpace(fallback)
}
