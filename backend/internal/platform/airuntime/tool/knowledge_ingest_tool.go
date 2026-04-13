package airtool

import (
	"context"
	"fmt"
	"strings"

	einotool "github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
)

type KnowledgeIngestManageArgs struct {
	Action       string `json:"action"`
	DocumentHint string `json:"document_hint,omitempty"`
}

type KnowledgeIngestWatch struct {
	AssetID string `json:"asset_id"`
	Name    string `json:"name,omitempty"`
}

type KnowledgeIngestManageResult struct {
	Action          string                `json:"action"`
	DocumentID      string                `json:"document_id,omitempty"`
	MediaAssetID    string                `json:"media_asset_id,omitempty"`
	Title           string                `json:"title,omitempty"`
	Status          string                `json:"status,omitempty"`
	ProcessingStage string                `json:"processing_stage,omitempty"`
	StageLabel      string                `json:"stage_label,omitempty"`
	Retryable       bool                  `json:"retryable,omitempty"`
	Partial         bool                  `json:"partial,omitempty"`
	Settled         bool                  `json:"settled,omitempty"`
	Summary         string                `json:"summary,omitempty"`
	FailureReason   string                `json:"failure_reason,omitempty"`
	Message         string                `json:"message,omitempty"`
	Watch           *KnowledgeIngestWatch `json:"watch,omitempty"`
}

func NewKnowledgeIngestManageTool(manage func(context.Context, string, string) (*KnowledgeIngestManageResult, error)) (einotool.BaseTool, error) {
	return toolutils.InferTool(
		"knowledge_ingest_manage",
		"查询当前会话里最近上传文档的入库状态，或直接重试刚才失败/部分完成的 PDF、DOCX、Markdown 等知识库文件。action 仅支持 status 或 retry；当用户说“刚才那个文件成功没”“帮我重试上一个 PDF”时优先调用。",
		func(ctx context.Context, input KnowledgeIngestManageArgs) (string, error) {
			action := strings.ToLower(strings.TrimSpace(input.Action))
			switch action {
			case "status", "retry":
			default:
				return "", fmt.Errorf("action must be status or retry")
			}
			result, err := manage(ctx, action, strings.TrimSpace(input.DocumentHint))
			if err != nil {
				return "", err
			}
			if result == nil {
				result = &KnowledgeIngestManageResult{Action: action}
			}
			result.Action = action
			return marshal(result)
		},
	)
}
