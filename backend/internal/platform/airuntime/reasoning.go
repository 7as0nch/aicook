package airuntime

import (
	"context"
	"encoding/json"
	"strings"
	"sync"

	"github.com/cloudwego/eino/schema"
)

type citationsContextKey string

const citationsCollectorContextKey citationsContextKey = "aicook.native_citations_collector"

type citationsCollector struct {
	mu           sync.Mutex
	items        []Source
	errorMessage string
}

type nativeSearchSnapshot struct {
	Results []Source
	Error   string
}

func withCitationsCollector(ctx context.Context) context.Context {
	return context.WithValue(ctx, citationsCollectorContextKey, &citationsCollector{})
}

func citationsCollectorFromContext(ctx context.Context) *citationsCollector {
	collector, _ := ctx.Value(citationsCollectorContextKey).(*citationsCollector)
	return collector
}

func (c *citationsCollector) add(items []Source) {
	if c == nil || len(items) == 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = dedupeSources(append(c.items, items...))
}

func (c *citationsCollector) list() []Source {
	if c == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]Source(nil), c.items...)
}

func (c *citationsCollector) setError(message string) {
	if c == nil {
		return
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.errorMessage = message
}

func (c *citationsCollector) errorMessageValue() string {
	if c == nil {
		return ""
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.errorMessage
}

func (c *citationsCollector) snapshot() nativeSearchSnapshot {
	if c == nil {
		return nativeSearchSnapshot{}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return nativeSearchSnapshot{
		Results: append([]Source(nil), c.items...),
		Error:   c.errorMessage,
	}
}

type openAIReasoningEnvelope struct {
	Choices []struct {
		Message *struct {
			ReasoningContent any `json:"reasoning_content"`
			Reasoning        any `json:"reasoning"`
			Annotations      any `json:"annotations"`
			ErrorMessage     string `json:"error_message"`
		} `json:"message"`
		Delta *struct {
			ReasoningContent any `json:"reasoning_content"`
			Reasoning        any `json:"reasoning"`
			Annotations      any `json:"annotations"`
			ErrorMessage     string `json:"error_message"`
		} `json:"delta"`
	} `json:"choices"`
}

func reasoningResponseModifier(ctx context.Context, msg *schema.Message, rawBody []byte) (*schema.Message, error) {
	return applyReasoningCompatibility(ctx, msg, rawBody, false), nil
}

func reasoningChunkModifier(ctx context.Context, msg *schema.Message, rawBody []byte, end bool) (*schema.Message, error) {
	if end {
		return msg, nil
	}
	return applyReasoningCompatibility(ctx, msg, rawBody, true), nil
}

func applyReasoningCompatibility(ctx context.Context, msg *schema.Message, rawBody []byte, stream bool) *schema.Message {
	if msg == nil {
		return nil
	}
	if citations := extractCitations(rawBody, stream); len(citations) > 0 {
		if collector := citationsCollectorFromContext(ctx); collector != nil {
			collector.add(citations)
		}
	}
	if searchError := extractSearchError(rawBody, stream); searchError != "" {
		if collector := citationsCollectorFromContext(ctx); collector != nil {
			collector.setError(searchError)
		}
	}
	if normalized := normalizeReasoningContent(msg.ReasoningContent); normalized != "" {
		msg.ReasoningContent = normalized
		return msg
	}
	if len(rawBody) == 0 {
		return msg
	}
	if extracted := extractReasoningContent(rawBody, stream); extracted != "" {
		msg.ReasoningContent = extracted
	}
	return msg
}

func extractReasoningContent(rawBody []byte, stream bool) string {
	var payload openAIReasoningEnvelope
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return ""
	}
	for _, choice := range payload.Choices {
		if stream && choice.Delta != nil {
			if text := firstReasoningText(choice.Delta.ReasoningContent, choice.Delta.Reasoning); text != "" {
				return text
			}
		}
		if choice.Message != nil {
			if text := firstReasoningText(choice.Message.ReasoningContent, choice.Message.Reasoning); text != "" {
				return text
			}
		}
		if choice.Delta != nil {
			if text := firstReasoningText(choice.Delta.ReasoningContent, choice.Delta.Reasoning); text != "" {
				return text
			}
		}
	}
	return ""
}

func firstReasoningText(values ...any) string {
	for _, value := range values {
		if text := normalizeReasoningValue(value); text != "" {
			return text
		}
	}
	return ""
}

func normalizeReasoningValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return normalizeReasoningContent(v)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			if text := normalizeReasoningValue(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.TrimSpace(strings.Join(parts, "\n"))
	case map[string]any:
		for _, key := range []string{"text", "content", "reasoning_content", "reasoning"} {
			if text := normalizeReasoningValue(v[key]); text != "" {
				return text
			}
		}
	}
	return ""
}

func normalizeReasoningContent(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	var unquoted string
	if err := json.Unmarshal([]byte(text), &unquoted); err == nil {
		return strings.TrimSpace(unquoted)
	}
	return text
}

func extractCitations(rawBody []byte, stream bool) []Source {
	if len(rawBody) == 0 {
		return nil
	}
	var payload openAIReasoningEnvelope
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return nil
	}
	results := make([]Source, 0, 4)
	for _, choice := range payload.Choices {
		if stream && choice.Delta != nil {
			results = append(results, normalizeCitationSources(choice.Delta.Annotations)...)
		}
		if choice.Message != nil {
			results = append(results, normalizeCitationSources(choice.Message.Annotations)...)
		}
		if choice.Delta != nil {
			results = append(results, normalizeCitationSources(choice.Delta.Annotations)...)
		}
	}
	return dedupeSources(results)
}

func extractSearchError(rawBody []byte, stream bool) string {
	if len(rawBody) == 0 {
		return ""
	}
	var payload openAIReasoningEnvelope
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return ""
	}
	for _, choice := range payload.Choices {
		if stream && choice.Delta != nil && strings.TrimSpace(choice.Delta.ErrorMessage) != "" {
			return strings.TrimSpace(choice.Delta.ErrorMessage)
		}
		if choice.Message != nil && strings.TrimSpace(choice.Message.ErrorMessage) != "" {
			return strings.TrimSpace(choice.Message.ErrorMessage)
		}
		if choice.Delta != nil && strings.TrimSpace(choice.Delta.ErrorMessage) != "" {
			return strings.TrimSpace(choice.Delta.ErrorMessage)
		}
	}
	return ""
}

func normalizeCitationSources(value any) []Source {
	items, ok := value.([]any)
	if !ok || len(items) == 0 {
		return nil
	}
	results := make([]Source, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(asString(m["type"])) != "url_citation" {
			continue
		}
		url := strings.TrimSpace(asString(m["url"]))
		title := strings.TrimSpace(asString(m["title"]))
		summary := strings.TrimSpace(asString(m["summary"]))
		siteName := strings.TrimSpace(asString(m["site_name"]))
		publishTime := strings.TrimSpace(asString(m["publish_time"]))
		logoURL := strings.TrimSpace(asString(m["logo_url"]))
		if url == "" && title == "" && summary == "" {
			continue
		}
		if title == "" {
			title = "联网来源"
		}
		results = append(results, Source{
			Title:      title,
			DocumentID: url,
			Snippet:    summary,
			SiteName:   siteName,
			PublishTime: publishTime,
			LogoURL:    logoURL,
		})
	}
	return results
}

func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	default:
		return ""
	}
}

func citationsFromContext(ctx context.Context) []Source {
	if collector := citationsCollectorFromContext(ctx); collector != nil {
		return collector.list()
	}
	return nil
}

func searchErrorFromContext(ctx context.Context) string {
	if collector := citationsCollectorFromContext(ctx); collector != nil {
		return collector.errorMessageValue()
	}
	return ""
}

func nativeSearchSnapshotFromContext(ctx context.Context) nativeSearchSnapshot {
	if collector := citationsCollectorFromContext(ctx); collector != nil {
		return collector.snapshot()
	}
	return nativeSearchSnapshot{}
}

func dedupeSources(items []Source) []Source {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(items))
	results := make([]Source, 0, len(items))
	for _, item := range items {
		key := strings.TrimSpace(item.DocumentID) + "\n" + strings.TrimSpace(item.Title)
		if key == "\n" {
			key = strings.TrimSpace(item.Snippet)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		results = append(results, item)
	}
	return results
}
