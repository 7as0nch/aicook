package biz

import (
	"strings"
	"testing"
	"time"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime/rag"
)

func TestExtractProcessedThroughPageUsesNextPage(t *testing.T) {
	stats := rag.ExtractStats{
		PageCount: 897,
		StartPage: 359,
		NextPage:  601,
	}
	if got := extractProcessedThroughPage(stats); got != 600 {
		t.Fatalf("expected processed through page 600, got %d", got)
	}
}

func TestBuildExtractPartialSummaryUsesGlobalProgress(t *testing.T) {
	stats := rag.ExtractStats{
		PageCount: 897,
		StartPage: 359,
		NextPage:  601,
		LastError: "deadline_exceeded",
		Partial:   true,
	}
	summary := buildExtractPartialSummary(stats)
	if !strings.Contains(summary, "600/897") {
		t.Fatalf("expected global page progress in summary, got %q", summary)
	}
}

func TestKnowledgeAsyncInProgressHonorsHeartbeatTTL(t *testing.T) {
	doc := &data.KnowledgeDocument{
		MetadataJSON: map[string]any{
			"extract_async_running":      true,
			"extract_async_heartbeat_at": time.Now().UTC().Format(time.RFC3339),
		},
	}
	if !knowledgeAsyncInProgress(doc) {
		t.Fatalf("expected fresh heartbeat to be considered running")
	}

	doc.MetadataJSON["extract_async_heartbeat_at"] = time.Now().UTC().Add(-knowledgeAsyncHeartbeatTTL - time.Minute).Format(time.RFC3339)
	if knowledgeAsyncInProgress(doc) {
		t.Fatalf("expected stale heartbeat to be considered stopped")
	}
}
