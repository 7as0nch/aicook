package biz

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	kgraph "github.com/chengjiang/aicook/backend/internal/platform/airuntime/graph"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime/rag"
	"github.com/chengjiang/aicook/backend/internal/platform/embeddings"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
	"github.com/chengjiang/aicook/backend/internal/utils"
	"github.com/pgvector/pgvector-go"
	"gorm.io/gorm"
)

type KnowledgeRepo interface {
	CreateBase(ctx context.Context, base *data.KnowledgeBase) error
	ListBases(ctx context.Context, householdID int64) ([]*data.KnowledgeBase, error)
	GetBase(ctx context.Context, id int64) (*data.KnowledgeBase, error)
	CreateDocument(ctx context.Context, document *data.KnowledgeDocument) error
	GetDocument(ctx context.Context, id int64) (*data.KnowledgeDocument, error)
	UpdateKnowledgeDocumentFields(ctx context.Context, id int64, updates map[string]any) error
	ListDocuments(ctx context.Context, baseID int64) ([]*data.KnowledgeDocument, error)
	ReplaceChunks(ctx context.Context, documentID int64, chunks []*data.KnowledgeChunk) error
	SearchChunks(ctx context.Context, baseID int64, query string, queryVec []float32, limit int) ([]*data.KnowledgeChunk, error)
	ListHouseholdAIMemories(ctx context.Context, householdID int64, limit int) ([]*data.HouseholdAIMemory, error)
	CreateHouseholdAIMemory(ctx context.Context, row *data.HouseholdAIMemory) error
	SearchKnowledgeGraphEdges(ctx context.Context, householdID int64, query string, limit int) ([]*data.KnowledgeGraphEdge, error)
	DeleteKnowledgeGraphEdgesByDocument(ctx context.Context, householdID, documentID int64) error
	CreateKnowledgeGraphEdgesBatch(ctx context.Context, edges []*data.KnowledgeGraphEdge) error
	GetLatestDocumentByMediaAssetID(ctx context.Context, householdID, mediaAssetID int64) (*data.KnowledgeDocument, error)
	FindLatestDocumentForHousehold(ctx context.Context, householdID int64, hint string) (*data.KnowledgeDocument, error)
}

type CreateKnowledgeBaseRequest struct {
	HouseholdID int64
	Name        string
	Description string
}

type CreateKnowledgeDocumentRequest struct {
	KnowledgeBaseID int64
	MediaAssetID    int64
	Title           string
}

type QueryResult struct {
	Answer  string
	Sources []airuntime.Source
	Mode    string
}

const (
	aiIngestKnowledgeBaseName = "厨艺AI资料库"
	kgExtractVersion          = "llm_extract_v1"
	maxGraphExcerptRunes      = 12000
	// maxKnowledgeIngestPayloadBytes 单文档拉取后的体积上限，避免超大 PDF 占满内存或解析挂死。
	maxKnowledgeIngestPayloadBytes = 100 << 20
	// knowledgePDFExtractTimeout 单段 PDF 纯文本抽取最长时间；超大 PDF 会按这个时间片后台续跑。
	knowledgePDFExtractTimeout = 5 * time.Minute
	// knowledgeAsyncHeartbeatTTL 用于判断后台分页续跑是否还活着，避免用户重试与后台任务撞车。
	knowledgeAsyncHeartbeatTTL = 20 * time.Minute
)

type KnowledgeUsecase struct {
	repo            KnowledgeRepo
	mediaRepo       MediaRepo
	recipeRepo      *data.RecipeRepo
	objectStorage   storage.ObjectStorage
	knowledgeBucket string
	aiRuntime       *airuntime.Runtime
	embedder        *embeddings.Client
}

func NewKnowledgeUsecase(repo *data.KnowledgeRepo, mediaRepo *data.MediaRepo, recipeRepo *data.RecipeRepo, objectStorage storage.ObjectStorage, cfg *conf.Bootstrap, aiRuntime *airuntime.Runtime, embedder *embeddings.Client) *KnowledgeUsecase {
	usecase := &KnowledgeUsecase{
		repo:            repo,
		mediaRepo:       mediaRepo,
		recipeRepo:      recipeRepo,
		objectStorage:   objectStorage,
		knowledgeBucket: cfg.GetOss().GetKnowledgeBucket(),
		aiRuntime:       aiRuntime,
		embedder:        embedder,
	}
	if aiRuntime != nil {
		aiRuntime.RegisterKnowledgeLookup(usecase)
		aiRuntime.RegisterMemoryWriter(usecase)
		aiRuntime.RefreshADKAfterRegistrations()
	}
	return usecase
}

func (u *KnowledgeUsecase) CreateBase(ctx context.Context, req CreateKnowledgeBaseRequest) (*data.KnowledgeBase, error) {
	base := &data.KnowledgeBase{
		HouseholdID:      req.HouseholdID,
		Name:             req.Name,
		Description:      req.Description,
		Status:           "active",
		DefaultTopK:      4,
		DefaultChunkSize: 1200,
	}
	if err := u.repo.CreateBase(ctx, base); err != nil {
		return nil, err
	}
	return base, nil
}

func (u *KnowledgeUsecase) ListBases(ctx context.Context, householdID int64) ([]*data.KnowledgeBase, error) {
	return u.repo.ListBases(ctx, householdID)
}

// KnowledgeIngestStatusView 供厨艺 AI 轮询文档入库进度（切块 / 向量 / 图谱在服务端串行完成）。
type KnowledgeIngestStatusView struct {
	Pending         bool   `json:"pending"`
	Settled         bool   `json:"settled"`
	DocumentID      string `json:"document_id,omitempty"`
	MediaAssetID    string `json:"media_asset_id,omitempty"`
	Title           string `json:"title"`
	ProcessingStage string `json:"processing_stage"`
	Status          string `json:"status"`
	ChunkCount      int    `json:"chunk_count"`
	StageLabel      string `json:"stage_label"`
	Retryable       bool   `json:"retryable"`
	Partial         bool   `json:"partial"`
	FailureReason   string `json:"failure_reason,omitempty"`
	Summary         string `json:"summary,omitempty"`
	LastErrorKind   string `json:"last_error_kind,omitempty"`
	LastErrorDetail string `json:"last_error_detail,omitempty"`
}

// GetIngestStatusByMediaAsset 按上传返回的 media asset id 查询最近一次对应知识文档状态。
func (u *KnowledgeUsecase) GetIngestStatusByMediaAsset(ctx context.Context, householdID, mediaAssetID int64) (*KnowledgeIngestStatusView, error) {
	doc, err := u.repo.GetLatestDocumentByMediaAssetID(ctx, householdID, mediaAssetID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &KnowledgeIngestStatusView{Pending: true, Settled: false, StageLabel: "排队或准备中…"}, nil
		}
		return nil, err
	}
	return knowledgeIngestStatusFromDoc(doc), nil
}

func knowledgeIngestStatusFromDoc(doc *data.KnowledgeDocument) *KnowledgeIngestStatusView {
	v := &KnowledgeIngestStatusView{
		DocumentID:      strconv.FormatInt(doc.ID, 10),
		Title:           doc.Title,
		ProcessingStage: doc.ProcessingStage,
		Status:          doc.Status,
		ChunkCount:      doc.ChunkCount,
		StageLabel:      knowledgeIngestStageLabelCN(doc),
		Retryable:       knowledgeIngestRetryable(doc),
		Partial:         knowledgeIngestPartial(doc),
		FailureReason:   knowledgeIngestFailureReason(doc),
		Summary:         strings.TrimSpace(doc.Summary),
		LastErrorKind:   strings.TrimSpace(metadataString(doc.MetadataJSON, "extract_error_kind")),
		LastErrorDetail: strings.TrimSpace(nonEmptyString(metadataString(doc.MetadataJSON, "extract_error_detail"), metadataString(doc.MetadataJSON, "extract_stop_reason"))),
	}
	if doc.MediaAssetID != nil && *doc.MediaAssetID > 0 {
		v.MediaAssetID = strconv.FormatInt(*doc.MediaAssetID, 10)
	}
	v.Settled = knowledgeIngestSettled(doc)
	v.Pending = false
	return v
}

func knowledgeIngestSettled(doc *data.KnowledgeDocument) bool {
	if doc.Status == "failed" {
		return true
	}
	switch strings.TrimSpace(doc.ProcessingStage) {
	case "done", "extract_partial", "extract_empty", "error", "extract_timeout", "extract_skipped_large", "unsupported_type", "embed_failed":
		return true
	default:
		return false
	}
}

func knowledgeIngestStageLabelCN(doc *data.KnowledgeDocument) string {
	stage := strings.ToLower(strings.TrimSpace(doc.ProcessingStage))
	switch stage {
	case "extract_timeout":
		return "解析超时"
	case "extract_skipped_large":
		return "超过大小上限"
	case "fetch_object", "download":
		return "拉取文件…"
	case "extract":
		return "解析文本…"
	case "split":
		return "切分文本…"
	case "embed":
		return "生成向量…"
	case "store":
		return "写入知识库…"
	case "chunk_embed":
		return "切块与向量索引…"
	case "done":
		return "已完成"
	case "extract_partial":
		if knowledgeAsyncInProgress(doc) {
			return "后台继续补全…"
		}
		return "部分解析完成"
	case "extract_empty":
		return "无文本可索引"
	case "unsupported_type":
		return "文件类型暂不支持"
	case "embed_failed":
		return "向量生成失败"
	}
	if doc.Status == "failed" || stage == "error" {
		return "处理失败"
	}
	if doc.Status == "processing" {
		return "处理中…"
	}
	if stage == "" {
		return "处理中…"
	}
	return doc.ProcessingStage
}

func knowledgeIngestRetryable(doc *data.KnowledgeDocument) bool {
	if knowledgeAsyncInProgress(doc) {
		return false
	}
	switch strings.TrimSpace(doc.ProcessingStage) {
	case "extract_partial", "extract_timeout", "embed_failed", "error":
		return true
	default:
		return false
	}
}

func knowledgeIngestPartial(doc *data.KnowledgeDocument) bool {
	if doc == nil {
		return false
	}
	if strings.TrimSpace(doc.ProcessingStage) == "extract_partial" {
		return true
	}
	return metadataBool(doc.MetadataJSON, "extract_partial")
}

func knowledgeIngestFailureReason(doc *data.KnowledgeDocument) string {
	if doc == nil {
		return ""
	}
	if v := metadataString(doc.MetadataJSON, "extract_error_detail"); v != "" {
		return v
	}
	if v := metadataString(doc.MetadataJSON, "extract_stop_reason"); v != "" {
		return v
	}
	return strings.TrimSpace(doc.Summary)
}

func (u *KnowledgeUsecase) CreateDocument(ctx context.Context, req CreateKnowledgeDocumentRequest) (*data.KnowledgeDocument, error) {
	base, err := u.repo.GetBase(ctx, req.KnowledgeBaseID)
	if err != nil {
		return nil, err
	}

	asset, err := u.mediaRepo.Get(ctx, req.MediaAssetID)
	if err != nil {
		return nil, err
	}
	if asset.HouseholdID != base.HouseholdID {
		return nil, errors.New("media asset does not belong to this knowledge base household")
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = strings.TrimSuffix(asset.FileName, filepathExt(asset.FileName))
	}

	document := &data.KnowledgeDocument{
		KnowledgeBaseID: base.ID,
		MediaAssetID:    &asset.ID,
		Title:           title,
		FileName:        asset.FileName,
		ContentType:     asset.ContentType,
		Bucket:          asset.Bucket,
		ObjectKey:       asset.ObjectKey,
		Status:          "processing",
		ProcessingStage: "fetch_object",
		Summary:         fmt.Sprintf("来源资源: %s", asset.StorageURL),
	}
	if err := u.repo.CreateDocument(ctx, document); err != nil {
		return nil, err
	}

	return u.ingestDocumentRecord(ctx, base, document, asset, false, "")
}

func (u *KnowledgeUsecase) ListDocuments(ctx context.Context, baseID int64) ([]*data.KnowledgeDocument, error) {
	return u.repo.ListDocuments(ctx, baseID)
}

func (u *KnowledgeUsecase) RetryDocumentIngest(ctx context.Context, householdID, documentID int64, retryReason string) (*data.KnowledgeDocument, error) {
	document, err := u.repo.GetDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	base, err := u.repo.GetBase(ctx, document.KnowledgeBaseID)
	if err != nil {
		return nil, err
	}
	if base.HouseholdID != householdID {
		return nil, errors.New("knowledge document household mismatch")
	}
	if knowledgeAsyncInProgress(document) {
		return nil, errors.New("knowledge document is still resuming in background")
	}
	if strings.TrimSpace(document.ProcessingStage) != "" && document.Status == "processing" {
		return nil, errors.New("knowledge document is still processing")
	}
	if document.MediaAssetID == nil || *document.MediaAssetID <= 0 {
		return nil, errors.New("knowledge document has no media asset")
	}
	asset, err := u.mediaRepo.Get(ctx, *document.MediaAssetID)
	if err != nil {
		return nil, err
	}
	return u.ingestDocumentRecord(ctx, base, document, asset, true, retryReason)
}

func (u *KnowledgeUsecase) GetDocumentForHousehold(ctx context.Context, householdID, documentID int64) (*data.KnowledgeDocument, error) {
	document, err := u.repo.GetDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	base, err := u.repo.GetBase(ctx, document.KnowledgeBaseID)
	if err != nil {
		return nil, err
	}
	if base.HouseholdID != householdID {
		return nil, errors.New("knowledge document household mismatch")
	}
	return document, nil
}

func (u *KnowledgeUsecase) FindLatestDocumentForHousehold(ctx context.Context, householdID int64, hint string) (*data.KnowledgeDocument, error) {
	document, err := u.repo.FindLatestDocumentForHousehold(ctx, householdID, hint)
	if err != nil {
		return nil, err
	}
	base, err := u.repo.GetBase(ctx, document.KnowledgeBaseID)
	if err != nil {
		return nil, err
	}
	if base.HouseholdID != householdID {
		return nil, errors.New("knowledge document household mismatch")
	}
	return document, nil
}

func (u *KnowledgeUsecase) ingestDocumentRecord(ctx context.Context, base *data.KnowledgeBase, document *data.KnowledgeDocument, asset *data.MediaAsset, isRetry bool, retryReason string) (*data.KnowledgeDocument, error) {
	baseSummary := knowledgeDocumentSourceSummary(asset)
	resetUpdates := map[string]any{
		"status":           "processing",
		"processing_stage": "fetch_object",
		"summary":          baseSummary,
		"text_content":     "",
		"content_type":     asset.ContentType,
		"bucket":           asset.Bucket,
		"object_key":       asset.ObjectKey,
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, resetUpdates)
	u.mergeDocumentMetadata(ctx, document.ID, map[string]any{
		"extract_async_running":      false,
		"extract_async_heartbeat_at": "",
		"pdf_resume_next_page":       0,
	})
	if isRetry {
		u.mergeDocumentMetadata(ctx, document.ID, map[string]any{
			"retry_count":       metadataInt(document.MetadataJSON, "retry_count") + 1,
			"last_retry_at":     time.Now().UTC().Format(time.RFC3339),
			"last_retry_reason": strings.TrimSpace(nonEmptyString(retryReason, "user_retry")),
		})
	}
	document.Summary = baseSummary
	document.ContentType = asset.ContentType
	document.Bucket = asset.Bucket
	document.ObjectKey = asset.ObjectKey

	rollbackFailed := func(stage, msg string) {
		if strings.TrimSpace(stage) == "" {
			stage = "error"
		}
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "failed",
			"processing_stage": stage,
			"summary":          baseSummary + " | " + msg,
		})
	}

	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "download"})
	payload, err := u.objectStorage.GetObject(ctx, asset.Bucket, asset.ObjectKey)
	if err != nil {
		rollbackFailed("error", "拉取对象失败")
		return u.repo.GetDocument(ctx, document.ID)
	}

	payloadN := len(payload)
	if int64(payloadN) > maxKnowledgeIngestPayloadBytes {
		note := fmt.Sprintf("文件超过知识库单文档大小上限（%d MB），已跳过解析。", maxKnowledgeIngestPayloadBytes/(1<<20))
		slog.Warn("knowledge ingest payload over limit",
			"document_id", document.ID,
			"payload_bytes", payloadN,
			"limit_bytes", maxKnowledgeIngestPayloadBytes,
		)
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "failed",
			"processing_stage": "extract_skipped_large",
			"summary":          baseSummary + " | " + note,
		})
		return u.repo.GetDocument(ctx, document.ID)
	}

	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "extract"})
	extractResult, err := u.extractKnowledgeDocumentText(document.ID, asset, payload, 1, isRetry)
	extractStats := extractResult.Stats
	u.mergeDocumentMetadata(ctx, document.ID, buildExtractMetadata(extractResult))
	if err != nil {
		partialText := sanitizeKnowledgeText(extractResult.TextContent)
		if extractStats.Partial && partialText != "" {
			slog.Warn("knowledge document extract returned partial result with error; continue ingest",
				"document_id", document.ID,
				"error", err,
				"extract_error_kind", extractStats.ErrorKind,
				"pdf_pages_succeeded", extractStats.PagesSucceeded,
				"pdf_page_count", extractStats.PageCount,
			)
			extractResult.TextContent = partialText
		} else if extractStats.ErrorKind == "extract_timeout" {
			slog.Warn("knowledge document extract timeout",
				"document_id", document.ID,
				"duration_ms", extractStats.DurationMS,
				"extract_stop_reason", extractStats.StopReason,
				"extract_last_error", extractStats.LastError,
				"pdf_page_count", extractStats.PageCount,
				"pdf_pages_processed", extractStats.PagesProcessed,
				"pdf_pages_succeeded", extractStats.PagesSucceeded,
				"pdf_pages_failed", extractStats.PagesFailed,
				"pdf_last_page", extractStats.LastPage,
			)
			note := buildExtractTimeoutSummary(extractStats)
			_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
				"status":           "failed",
				"processing_stage": "extract_timeout",
				"summary":          baseSummary + " | " + note,
			})
			return u.repo.GetDocument(ctx, document.ID)
		} else {
			rollbackFailed("error", "文本抽取失败："+err.Error())
			return u.repo.GetDocument(ctx, document.ID)
		}
	}

	extractedText := sanitizeKnowledgeText(extractResult.TextContent)
	updates := map[string]any{
		"text_content": extractedText,
	}
	if strings.TrimSpace(extractResult.EffectiveContentType) != "" && strings.TrimSpace(extractResult.EffectiveContentType) != strings.TrimSpace(asset.ContentType) {
		updates["content_type"] = extractResult.EffectiveContentType
	}
	if err := u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, updates); err != nil {
		slog.Error("knowledge document store extracted text failed",
			"document_id", document.ID,
			"error", err,
			"text_runes", utf8.RuneCountInString(extractedText),
			"content_type", extractResult.EffectiveContentType,
			"extract_error_kind", extractStats.ErrorKind,
		)
		rollbackFailed("error", "写入抽取文本失败："+err.Error())
		return u.repo.GetDocument(ctx, document.ID)
	}

	if extractResult.Unsupported {
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "failed",
			"processing_stage": "unsupported_type",
			"summary":          baseSummary + " | " + extractResult.UnsupportedReason,
		})
		return u.repo.GetDocument(ctx, document.ID)
	}
	if strings.TrimSpace(extractedText) == "" {
		note := "未能从文件中解析出可读文本（常见原因：扫描版 PDF 没有文本层，或文件正文为空），因此未生成 chunks / 向量。"
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "failed",
			"processing_stage": "extract_empty",
			"summary":          baseSummary + " | " + note,
		})
		return u.repo.GetDocument(ctx, document.ID)
	}

	document.TextContent = extractedText
	if strings.TrimSpace(extractResult.EffectiveContentType) != "" {
		document.ContentType = extractResult.EffectiveContentType
	}
	chunkResult, err := u.replaceDocumentChunks(ctx, base, document)
	if err != nil {
		rollbackFailed("error", "切块/索引失败："+err.Error())
		return u.repo.GetDocument(ctx, document.ID)
	}
	u.mergeDocumentMetadata(ctx, document.ID, map[string]any{
		"chunk_size":      base.DefaultChunkSize,
		"overlap_size":    300,
		"chunk_count":     chunkResult.ChunkCount,
		"vector_count":    chunkResult.VectorCount,
		"embedding_model": nonEmptyEmbeddingModel(u.embedder),
	})
	if chunkResult.EmbeddingError != nil {
		slog.Warn("knowledge chunk embedding failed",
			"document_id", document.ID,
			"chunk_count", chunkResult.ChunkCount,
			"vector_count", chunkResult.VectorCount,
			"embedding_model", nonEmptyEmbeddingModel(u.embedder),
			"error", chunkResult.EmbeddingError,
		)
		u.mergeDocumentMetadata(ctx, document.ID, map[string]any{
			"embedding_status": "failed",
			"embedding_error":  strings.TrimSpace(chunkResult.EmbeddingError.Error()),
		})
		note := "文本切分和片段入库已完成，但向量生成失败：" + chunkResult.EmbeddingError.Error()
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "failed",
			"processing_stage": "embed_failed",
			"summary":          baseSummary + " | " + note,
		})
		return u.repo.GetDocument(ctx, document.ID)
	}
	u.mergeDocumentMetadata(ctx, document.ID, map[string]any{
		"embedding_status": "ok",
		"embedding_error":  "",
	})

	if shouldContinueAsyncPDFExtract(extractResult) {
		slog.Warn("knowledge document extract partial; continue in background",
			"document_id", document.ID,
			"pdf_page_count", extractStats.PageCount,
			"pdf_pages_processed", extractStats.PagesProcessed,
			"pdf_pages_succeeded", extractStats.PagesSucceeded,
			"pdf_pages_failed", extractStats.PagesFailed,
			"pdf_last_page", extractStats.LastPage,
			"pdf_next_page", extractStats.NextPage,
		)
		u.mergeDocumentMetadata(ctx, document.ID, buildExtractAsyncMetadata(extractStats, true))
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "indexed",
			"processing_stage": "extract_partial",
			"summary":          baseSummary + " | " + buildExtractAsyncSummary(extractStats),
		})
		current, loadErr := u.repo.GetDocument(ctx, document.ID)
		if loadErr == nil && current != nil {
			document = current
		}
		u.resumePartialPDFInBackground(base, document.ID, asset, payload)
		if document != nil {
			return document, nil
		}
		return u.repo.GetDocument(ctx, document.ID)
	}

	u.runKnowledgeGraphIngest(ctx, base, document.ID, document.Title, extractResult.TextContent)
	finalStage := "done"
	finalSummary := baseSummary
	if extractStats.Partial {
		slog.Warn("knowledge document extract partial",
			"document_id", document.ID,
			"duration_ms", extractStats.DurationMS,
			"extract_stop_reason", extractStats.StopReason,
			"extract_last_error", extractStats.LastError,
			"pdf_page_count", extractStats.PageCount,
			"pdf_pages_processed", extractStats.PagesProcessed,
			"pdf_pages_succeeded", extractStats.PagesSucceeded,
			"pdf_pages_failed", extractStats.PagesFailed,
			"pdf_last_page", extractStats.LastPage,
		)
		finalStage = "extract_partial"
		finalSummary = baseSummary + " | " + buildExtractPartialSummary(extractStats)
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
		"status":           "indexed",
		"processing_stage": finalStage,
		"summary":          finalSummary,
	})
	return u.repo.GetDocument(ctx, document.ID)
}

func (u *KnowledgeUsecase) Reindex(ctx context.Context, baseID int64) error {
	base, err := u.repo.GetBase(ctx, baseID)
	if err != nil {
		return err
	}

	docs, err := u.repo.ListDocuments(ctx, baseID)
	if err != nil {
		return err
	}

	for _, doc := range docs {
		if strings.TrimSpace(doc.TextContent) == "" {
			continue
		}
		result, replaceErr := u.replaceDocumentChunks(ctx, base, doc)
		if replaceErr != nil {
			return replaceErr
		}
		u.mergeDocumentMetadata(ctx, doc.ID, map[string]any{
			"chunk_size":      base.DefaultChunkSize,
			"overlap_size":    300,
			"chunk_count":     result.ChunkCount,
			"vector_count":    result.VectorCount,
			"embedding_model": nonEmptyEmbeddingModel(u.embedder),
		})
		if result.EmbeddingError != nil {
			_ = u.repo.UpdateKnowledgeDocumentFields(ctx, doc.ID, map[string]any{
				"status":           "failed",
				"processing_stage": "embed_failed",
				"summary":          doc.Summary + " | 文本片段已重建，但向量生成失败：" + result.EmbeddingError.Error(),
			})
			continue
		}
		u.runKnowledgeGraphIngest(ctx, base, doc.ID, doc.Title, doc.TextContent)
		finalStage := "done"
		if metadataBool(doc.MetadataJSON, "extract_partial") || strings.TrimSpace(doc.ProcessingStage) == "extract_partial" {
			finalStage = "extract_partial"
		}
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, doc.ID, map[string]any{
			"status":           "indexed",
			"processing_stage": finalStage,
		})
	}
	return nil
}

func (u *KnowledgeUsecase) Query(ctx context.Context, baseID int64, question string) (*QueryResult, error) {
	qvec := u.embedQuery(ctx, question)
	chunks, err := u.repo.SearchChunks(ctx, baseID, question, qvec, 4)
	if err != nil {
		return nil, err
	}

	sources := make([]airuntime.Source, 0, len(chunks))
	for _, chunk := range chunks {
		sources = append(sources, airuntime.Source{
			Title:      fmt.Sprintf("知识片段 #%d", chunk.ChunkNo),
			DocumentID: strconv.FormatInt(chunk.DocumentID, 10),
			Snippet:    chunk.SourceSnippet,
			SourceKind: airuntime.SourceKindKnowledgeBase,
		})
	}

	reply, err := u.aiRuntime.Reply(ctx, airuntime.ReplyRequest{
		Scene:   "knowledge",
		Text:    question,
		Sources: sources,
	})
	if err != nil {
		return nil, err
	}

	return &QueryResult{
		Answer:  reply.Content,
		Sources: reply.Sources,
		Mode:    string(reply.Mode),
	}, nil
}

type knowledgeChunkReplaceResult struct {
	ChunkCount     int
	VectorCount    int
	EmbeddingError error
}

func (u *KnowledgeUsecase) replaceDocumentChunks(ctx context.Context, base *data.KnowledgeBase, document *data.KnowledgeDocument) (*knowledgeChunkReplaceResult, error) {
	if document == nil {
		return nil, errors.New("knowledge document is nil")
	}
	baseMeta := map[string]any{
		"document_id":       strconv.FormatInt(document.ID, 10),
		"knowledge_base_id": strconv.FormatInt(base.ID, 10),
		"title":             strings.TrimSpace(document.Title),
		"file_name":         strings.TrimSpace(document.FileName),
		"content_type":      strings.TrimSpace(document.ContentType),
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "split"})
	splitChunks, err := rag.SplitText(document.TextContent, rag.SplitConfig{ChunkSize: base.DefaultChunkSize, Overlap: 300}, baseMeta)
	if err != nil {
		return nil, err
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "embed"})
	embedResult := rag.EmbedChunks(ctx, splitChunks, func(ctx context.Context, texts []string) ([][]float32, error) {
		if u.embedder == nil {
			return nil, fmt.Errorf("embedding client is not configured")
		}
		return u.embedder.EmbedBatch(ctx, texts)
	})
	rows := buildKnowledgeChunkRows(base.ID, document.ID, embedResult.Chunks)
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "store"})
	if err := u.repo.ReplaceChunks(ctx, document.ID, rows); err != nil {
		return nil, err
	}
	return &knowledgeChunkReplaceResult{
		ChunkCount:     len(rows),
		VectorCount:    embedResult.VectorCount,
		EmbeddingError: embedResult.EmbeddingError,
	}, nil
}

func buildKnowledgeChunkRows(baseID, documentID int64, chunks []rag.Chunk) []*data.KnowledgeChunk {
	rows := make([]*data.KnowledgeChunk, 0, len(chunks))
	for _, chunk := range chunks {
		meta := cloneMetadataJSON(chunk.Metadata)
		if dim := len(chunk.Vector); dim > 0 {
			meta["embedding_dim"] = dim
		}
		row := &data.KnowledgeChunk{
			KnowledgeBaseID: baseID,
			DocumentID:      documentID,
			ChunkNo:         chunk.No,
			Content:         chunk.Content,
			SourceSnippet:   chunk.Snippet,
			TokenSize:       chunk.TokenSize,
			MetadataJSON:    meta,
		}
		if len(chunk.Vector) > 0 {
			v := pgvector.NewVector(chunk.Vector)
			row.Embedding = &v
		}
		rows = append(rows, row)
	}
	return rows
}

func nonEmptyEmbeddingModel(client *embeddings.Client) string {
	if client == nil {
		return ""
	}
	return strings.TrimSpace(client.Model())
}

func (u *KnowledgeUsecase) extractKnowledgeDocumentText(documentID int64, asset *data.MediaAsset, payload []byte, startPage int, isRetry bool) (rag.ExtractResult, error) {
	if startPage <= 0 {
		startPage = 1
	}
	asyncSegment := startPage > 1
	slog.Info("knowledge document extract start",
		"document_id", documentID,
		"payload_bytes", len(payload),
		"content_type", asset.ContentType,
		"is_retry", isRetry,
		"start_page", startPage,
		"async_segment", asyncSegment,
	)
	extractStart := time.Now()
	result, err := rag.ExtractTextWithOptions(asset.ContentType, asset.FileName, payload, rag.ExtractOptions{
		Timeout:      knowledgePDFExtractTimeout,
		PDFStartPage: startPage,
	})
	stats := result.Stats
	if stats.DurationMS == 0 {
		stats.DurationMS = time.Since(extractStart).Milliseconds()
	}
	result.Stats = stats
	slog.Info("knowledge document extract end",
		"document_id", documentID,
		"duration_ms", stats.DurationMS,
		"effective_content_type", result.EffectiveContentType,
		"text_runes", utf8.RuneCountInString(result.TextContent),
		"extract_error_kind", stats.ErrorKind,
		"extract_stop_reason", stats.StopReason,
		"extract_last_error", stats.LastError,
		"pdf_page_count", stats.PageCount,
		"pdf_start_page", stats.StartPage,
		"pdf_next_page", stats.NextPage,
		"pdf_pages_processed", stats.PagesProcessed,
		"pdf_pages_succeeded", stats.PagesSucceeded,
		"pdf_pages_failed", stats.PagesFailed,
		"pdf_last_page", stats.LastPage,
		"extract_partial", stats.Partial,
		"extract_completed", stats.Completed,
		"async_segment", asyncSegment,
	)
	return result, err
}

// 超大 PDF 首段先返回 partial，后台继续分页补全；非 PDF、非超时或已补齐的结果不走这条分支。
func shouldContinueAsyncPDFExtract(result rag.ExtractResult) bool {
	if !strings.Contains(strings.ToLower(strings.TrimSpace(result.EffectiveContentType)), "pdf") {
		return false
	}
	stats := result.Stats
	if stats.ErrorKind != "extract_timeout" || !stats.Partial || stats.Completed {
		return false
	}
	return stats.NextPage > 1 && stats.NextPage <= stats.PageCount
}

func (u *KnowledgeUsecase) resumePartialPDFInBackground(base *data.KnowledgeBase, documentID int64, asset *data.MediaAsset, payload []byte) {
	if u == nil || base == nil || asset == nil || len(payload) == 0 {
		return
	}
	utils.Safego(func() {
		if err := u.resumePartialPDFIngestLoop(context.Background(), base, documentID, asset, payload); err != nil {
			slog.Error("knowledge document async extract crashed",
				"document_id", documentID,
				"error", err,
			)
			u.pauseAsyncPDFIngest(context.Background(), documentID, asset, "后台补全异常中断："+err.Error())
		}
	})
}

func (u *KnowledgeUsecase) resumePartialPDFIngestLoop(ctx context.Context, base *data.KnowledgeBase, documentID int64, asset *data.MediaAsset, payload []byte) error {
	baseSummary := knowledgeDocumentSourceSummary(asset)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		doc, err := u.repo.GetDocument(ctx, documentID)
		if err != nil {
			return err
		}
		startPage := metadataInt(doc.MetadataJSON, "pdf_resume_next_page")
		if startPage <= 1 {
			startPage = metadataInt(doc.MetadataJSON, "pdf_last_page") + 1
		}
		if startPage <= 1 {
			return nil
		}

		u.mergeDocumentMetadata(ctx, documentID, buildAsyncHeartbeatMetadata(true))
		extractResult, extractErr := u.extractKnowledgeDocumentText(documentID, asset, payload, startPage, false)
		extractStats := extractResult.Stats
		u.mergeDocumentMetadata(ctx, documentID, buildExtractMetadata(extractResult))

		partialText := sanitizeKnowledgeText(extractResult.TextContent)
		if extractErr != nil && !(extractStats.Partial && partialText != "") {
			slog.Warn("knowledge document async extract paused",
				"document_id", documentID,
				"start_page", startPage,
				"error", extractErr,
				"extract_error_kind", extractStats.ErrorKind,
				"pdf_next_page", extractStats.NextPage,
			)
			u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, false))
			u.pauseAsyncPDFIngest(ctx, documentID, asset, buildExtractAsyncPausedSummary(extractStats))
			return nil
		}
		if extractErr != nil {
			slog.Warn("knowledge document async extract returned partial result with error; continue ingest",
				"document_id", documentID,
				"start_page", startPage,
				"error", extractErr,
				"extract_error_kind", extractStats.ErrorKind,
				"pdf_next_page", extractStats.NextPage,
			)
		}

		combinedText := appendKnowledgeText(doc.TextContent, partialText)
		updates := map[string]any{
			"text_content": combinedText,
		}
		if strings.TrimSpace(extractResult.EffectiveContentType) != "" && strings.TrimSpace(extractResult.EffectiveContentType) != strings.TrimSpace(doc.ContentType) {
			updates["content_type"] = extractResult.EffectiveContentType
		}
		if err := u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, updates); err != nil {
			u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, false))
			u.pauseAsyncPDFIngest(ctx, documentID, asset, "后台补全写入抽取文本失败："+err.Error())
			return nil
		}

		doc.TextContent = combinedText
		if strings.TrimSpace(extractResult.EffectiveContentType) != "" {
			doc.ContentType = extractResult.EffectiveContentType
		}
		chunkResult, err := u.replaceDocumentChunks(ctx, base, doc)
		if err != nil {
			u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, false))
			u.pauseAsyncPDFIngest(ctx, documentID, asset, "后台补全切块/索引失败："+err.Error())
			return nil
		}
		u.mergeDocumentMetadata(ctx, documentID, map[string]any{
			"chunk_size":      base.DefaultChunkSize,
			"overlap_size":    300,
			"chunk_count":     chunkResult.ChunkCount,
			"vector_count":    chunkResult.VectorCount,
			"embedding_model": nonEmptyEmbeddingModel(u.embedder),
		})
		if chunkResult.EmbeddingError != nil {
			slog.Warn("knowledge chunk embedding failed during async resume",
				"document_id", documentID,
				"chunk_count", chunkResult.ChunkCount,
				"vector_count", chunkResult.VectorCount,
				"embedding_model", nonEmptyEmbeddingModel(u.embedder),
				"error", chunkResult.EmbeddingError,
			)
			u.mergeDocumentMetadata(ctx, documentID, map[string]any{
				"embedding_status": "failed",
				"embedding_error":  strings.TrimSpace(chunkResult.EmbeddingError.Error()),
			})
			u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, false))
			_ = u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, map[string]any{
				"status":           "failed",
				"processing_stage": "embed_failed",
				"summary":          baseSummary + " | 文本切分和片段入库已完成，但向量生成失败：" + chunkResult.EmbeddingError.Error(),
			})
			return nil
		}
		u.mergeDocumentMetadata(ctx, documentID, map[string]any{
			"embedding_status": "ok",
			"embedding_error":  "",
		})

		if shouldContinueAsyncPDFExtract(extractResult) {
			if extractStats.NextPage <= startPage {
				slog.Warn("knowledge document async extract stalled",
					"document_id", documentID,
					"start_page", startPage,
					"next_page", extractStats.NextPage,
					"extract_error_kind", extractStats.ErrorKind,
				)
				u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, false))
				u.pauseAsyncPDFIngest(ctx, documentID, asset, buildExtractAsyncPausedSummary(extractStats))
				return nil
			}
			u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, true))
			_ = u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, map[string]any{
				"status":           "indexed",
				"processing_stage": "extract_partial",
				"summary":          baseSummary + " | " + buildExtractAsyncSummary(extractStats),
			})
			continue
		}

		u.mergeDocumentMetadata(ctx, documentID, buildExtractAsyncMetadata(extractStats, false))
		u.runKnowledgeGraphIngest(ctx, base, documentID, doc.Title, combinedText)
		finalStage := "done"
		finalSummary := baseSummary
		if extractStats.Partial {
			finalStage = "extract_partial"
			finalSummary = baseSummary + " | " + buildExtractPartialSummary(extractStats)
		}
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, map[string]any{
			"status":           "indexed",
			"processing_stage": finalStage,
			"summary":          finalSummary,
		})
		slog.Info("knowledge document async extract finished",
			"document_id", documentID,
			"final_stage", finalStage,
			"pdf_page_count", extractStats.PageCount,
			"pdf_processed_through_page", extractProcessedThroughPage(extractStats),
		)
		return nil
	}
}

func (u *KnowledgeUsecase) pauseAsyncPDFIngest(ctx context.Context, documentID int64, asset *data.MediaAsset, note string) {
	u.mergeDocumentMetadata(ctx, documentID, buildAsyncHeartbeatMetadata(false))
	summary := knowledgeDocumentSourceSummary(asset)
	note = strings.TrimSpace(note)
	if note != "" {
		summary += " | " + note
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, map[string]any{
		"status":           "indexed",
		"processing_stage": "extract_partial",
		"summary":          summary,
	})
}

func appendKnowledgeText(existing, extra string) string {
	existing = strings.TrimSpace(existing)
	extra = strings.TrimSpace(extra)
	switch {
	case existing == "":
		return extra
	case extra == "":
		return existing
	default:
		return existing + "\n" + extra
	}
}

func knowledgeDocumentSourceSummary(asset *data.MediaAsset) string {
	if asset == nil {
		return ""
	}
	return fmt.Sprintf("来源资源: %s", strings.TrimSpace(asset.StorageURL))
}

func buildExtractMetadata(result rag.ExtractResult) map[string]any {
	meta := map[string]any{
		"effective_content_type": strings.TrimSpace(result.EffectiveContentType),
		"extractor":              nonEmptyString(result.Stats.Extractor, "airuntime/rag"),
		"extract_error_kind":     strings.TrimSpace(result.Stats.ErrorKind),
		"extract_stop_reason":    strings.TrimSpace(result.Stats.StopReason),
		"extract_error_detail":   strings.TrimSpace(result.Stats.LastError),
		"extract_partial":        result.Stats.Partial,
		"extract_completed":      result.Stats.Completed,
		"extract_duration_ms":    result.Stats.DurationMS,
	}
	if result.Stats.PageCount > 0 {
		meta["pdf_page_count"] = result.Stats.PageCount
		meta["pdf_start_page"] = result.Stats.StartPage
		meta["pdf_next_page"] = result.Stats.NextPage
		meta["pdf_pages_processed"] = result.Stats.PagesProcessed
		meta["pdf_pages_succeeded"] = result.Stats.PagesSucceeded
		meta["pdf_pages_failed"] = result.Stats.PagesFailed
		meta["pdf_last_page"] = result.Stats.LastPage
		meta["extract_timeout_ms"] = knowledgePDFExtractTimeout.Milliseconds()
	}
	return meta
}

func buildExtractTimeoutSummary(stats rag.ExtractStats) string {
	processedThrough := extractProcessedThroughPage(stats)
	if stats.PageCount > 0 {
		return fmt.Sprintf(
			"PDF 文本解析超时（%s，已处理 %d/%d 页，停在第 %d 页附近）；无需重新上传，可直接重试这份文件。",
			knowledgePDFExtractTimeout,
			processedThrough,
			stats.PageCount,
			maxInt(1, nonZeroInt(stats.NextPage, stats.LastPage)),
		)
	}
	return fmt.Sprintf("PDF 文本解析超时（%s）；无需重新上传，可直接重试这份文件。", knowledgePDFExtractTimeout)
}

func buildExtractPartialSummary(stats rag.ExtractStats) string {
	processedThrough := extractProcessedThroughPage(stats)
	if stats.PageCount > 0 {
		if stats.Completed && stats.PagesFailed > 0 {
			return fmt.Sprintf("PDF 已解析到末页，但期间有 %d 页失败（当前处理到第 %d/%d 页），已先入库可用内容，可直接重试补全。", stats.PagesFailed, processedThrough, stats.PageCount)
		}
		if strings.TrimSpace(stats.LastError) != "" {
			return fmt.Sprintf("PDF 仅部分解析完成（当前处理到第 %d/%d 页，原因：%s），已先入库可用内容，可直接重试补全。", processedThrough, stats.PageCount, stats.LastError)
		}
		return fmt.Sprintf("PDF 仅部分解析完成（当前处理到第 %d/%d 页），已先入库可用内容，可直接重试补全。", processedThrough, stats.PageCount)
	}
	if strings.TrimSpace(stats.LastError) != "" {
		return "文档仅部分解析完成，已先入库可用内容，可直接重试补全。原因：" + strings.TrimSpace(stats.LastError)
	}
	return "文档仅部分解析完成，已先入库可用内容，可直接重试补全。"
}

func buildExtractAsyncSummary(stats rag.ExtractStats) string {
	processedThrough := extractProcessedThroughPage(stats)
	nextPage := stats.NextPage
	if nextPage <= 0 {
		nextPage = processedThrough + 1
	}
	if stats.PageCount > 0 {
		if strings.TrimSpace(stats.LastError) != "" {
			return fmt.Sprintf("PDF 已先处理到第 %d/%d 页（下一段从第 %d 页继续，原因：%s），当前可用内容已入库，后台继续补全。", processedThrough, stats.PageCount, nextPage, strings.TrimSpace(stats.LastError))
		}
		return fmt.Sprintf("PDF 已先处理到第 %d/%d 页（下一段从第 %d 页继续），当前可用内容已入库，后台继续补全。", processedThrough, stats.PageCount, nextPage)
	}
	return "文档已先入库可用内容，后台继续补全剩余部分。"
}

func buildExtractAsyncPausedSummary(stats rag.ExtractStats) string {
	processedThrough := extractProcessedThroughPage(stats)
	nextPage := stats.NextPage
	if nextPage <= 0 {
		nextPage = maxInt(1, stats.StartPage)
	}
	if stats.PageCount > 0 {
		if strings.TrimSpace(stats.LastError) != "" {
			return fmt.Sprintf("PDF 已先处理到第 %d/%d 页，后台补全停在第 %d 页附近（原因：%s），当前可用内容仍可检索，可稍后直接重试这份文件。", processedThrough, stats.PageCount, nextPage, strings.TrimSpace(stats.LastError))
		}
		return fmt.Sprintf("PDF 已先处理到第 %d/%d 页，后台补全停在第 %d 页附近，当前可用内容仍可检索，可稍后直接重试这份文件。", processedThrough, stats.PageCount, nextPage)
	}
	return "当前可用内容仍可检索，但后台补全已暂停，可稍后直接重试这份文件。"
}

func buildAsyncHeartbeatMetadata(running bool) map[string]any {
	return map[string]any{
		"extract_async_running":      running,
		"extract_async_heartbeat_at": time.Now().UTC().Format(time.RFC3339),
	}
}

func buildExtractAsyncMetadata(stats rag.ExtractStats, running bool) map[string]any {
	meta := buildAsyncHeartbeatMetadata(running)
	meta["pdf_resume_next_page"] = stats.NextPage
	if stats.PageCount > 0 {
		meta["pdf_processed_through_page"] = extractProcessedThroughPage(stats)
	}
	return meta
}

func (u *KnowledgeUsecase) embedQuery(ctx context.Context, q string) []float32 {
	if u.embedder == nil {
		return nil
	}
	q = strings.TrimSpace(q)
	if q == "" {
		return nil
	}
	vec, err := u.embedder.Embed(ctx, q)
	if err != nil || len(vec) == 0 {
		if err != nil {
			slog.Warn("knowledge query embedding failed",
				"embedding_model", nonEmptyEmbeddingModel(u.embedder),
				"question", q,
				"error", err,
			)
		}
		return nil
	}
	return vec
}

func filepathExt(name string) string {
	idx := strings.LastIndex(name, ".")
	if idx <= 0 {
		return ""
	}
	return name[idx:]
}

const maxHouseholdAIMemoryRunes = 2000

// SaveHouseholdMemory 实现 airuntime.MemoryWriter：写入家庭长期记忆。
func (u *KnowledgeUsecase) SaveHouseholdMemory(ctx context.Context, householdID, userID int64, scope, content, source string) error {
	if u == nil || u.repo == nil {
		return errors.New("knowledge usecase not configured")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return errors.New("empty memory content")
	}
	runes := []rune(content)
	if len(runes) > maxHouseholdAIMemoryRunes {
		content = string(runes[:maxHouseholdAIMemoryRunes])
	}
	scope = strings.TrimSpace(strings.ToLower(scope))
	if scope == "" {
		scope = "general"
	}
	switch scope {
	case "preference", "dietary", "general":
	default:
		scope = "general"
	}
	src := strings.TrimSpace(source)
	if src == "" {
		src = "assistant"
	}
	row := &data.HouseholdAIMemory{
		HouseholdID: householdID,
		Scope:       scope,
		Content:     content,
		Source:      src,
	}
	if userID > 0 {
		row.UserID = &userID
	}
	return u.repo.CreateHouseholdAIMemory(ctx, row)
}

// ListHouseholdAIMemoriesForActor 供 HTTP：当前登录家庭记忆列表。
func (u *KnowledgeUsecase) ListHouseholdAIMemoriesForActor(ctx context.Context, limit int) ([]*data.HouseholdAIMemory, error) {
	actor := ActorFromContext(ctx)
	if limit <= 0 {
		limit = 50
	}
	return u.repo.ListHouseholdAIMemories(ctx, actor.HouseholdID, limit)
}

// SaveHouseholdAIMemoryForActor 供 HTTP：按当前用户写入一条记忆。
func (u *KnowledgeUsecase) SaveHouseholdAIMemoryForActor(ctx context.Context, content, scope string) error {
	actor := ActorFromContext(ctx)
	return u.SaveHouseholdMemory(ctx, actor.HouseholdID, actor.UserID, scope, content, "api")
}

func (u *KnowledgeUsecase) LookupKnowledgeSources(ctx context.Context, householdID int64, question string, limit int) ([]airuntime.Source, error) {
	if limit <= 0 {
		limit = 4
	}
	sources := make([]airuntime.Source, 0, limit)

	memCap := min(3, limit)
	memories, err := u.repo.ListHouseholdAIMemories(ctx, householdID, memCap)
	if err != nil {
		return nil, err
	}
	for _, m := range memories {
		if len(sources) >= limit {
			return sources, nil
		}
		sources = append(sources, airuntime.Source{
			Title:      fmt.Sprintf("家庭记忆 · %s", m.Scope),
			DocumentID: "",
			Snippet:    m.Content,
			SourceKind: airuntime.SourceKindMemory,
		})
	}

	q := strings.TrimSpace(question)
	edgeLimit := min(3, limit-len(sources))
	if edgeLimit > 0 {
		edges, gerr := u.repo.SearchKnowledgeGraphEdges(ctx, householdID, q, edgeLimit)
		if gerr != nil {
			return nil, gerr
		}
		for _, e := range edges {
			if len(sources) >= limit {
				return sources, nil
			}
			sources = append(sources, airuntime.Source{
				Title:      fmt.Sprintf("知识图谱 · %s", e.Predicate),
				DocumentID: e.SubjectID,
				Snippet:    fmt.Sprintf("%s (%s) → %s (%s)", e.SubjectID, e.SubjectKind, e.ObjectID, e.ObjectKind),
				SourceKind: airuntime.SourceKindKnowledgeGraph,
			})
		}
	}

	qvec := u.embedQuery(ctx, question)
	bases, err := u.repo.ListBases(ctx, householdID)
	if err != nil {
		return nil, err
	}
	for _, base := range bases {
		need := limit - len(sources)
		if need <= 0 {
			return sources, nil
		}
		chunks, searchErr := u.repo.SearchChunks(ctx, base.ID, question, qvec, need)
		if searchErr != nil {
			return nil, searchErr
		}
		for _, chunk := range chunks {
			if len(sources) >= limit {
				return sources, nil
			}
			sources = append(sources, airuntime.Source{
				Title:      fmt.Sprintf("%s · 片段 #%d", base.Name, chunk.ChunkNo),
				DocumentID: strconv.FormatInt(chunk.DocumentID, 10),
				Snippet:    chunk.SourceSnippet,
				SourceKind: airuntime.SourceKindKnowledgeBase,
			})
		}
	}
	return sources, nil
}

func (u *KnowledgeUsecase) mergeDocumentMetadata(ctx context.Context, documentID int64, patch map[string]any) {
	doc, err := u.repo.GetDocument(ctx, documentID)
	if err != nil || doc == nil {
		return
	}
	merged := map[string]any{}
	if doc.MetadataJSON != nil {
		for k, v := range doc.MetadataJSON {
			merged[k] = v
		}
	}
	for k, v := range patch {
		merged[k] = v
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, map[string]any{"metadata_json": merged})
}

func (u *KnowledgeUsecase) runKnowledgeGraphIngest(ctx context.Context, base *data.KnowledgeBase, documentID int64, title, textContent string) {
	in := kgraph.DocumentKnowledgeInput{
		HouseholdID: base.HouseholdID,
		BaseID:      base.ID,
		DocumentID:  documentID,
		Title:       title,
		TextContent: textContent,
	}
	cb := kgraph.DocumentKnowledgeCallbacks{
		IngestGraph: func(ictx context.Context, input kgraph.DocumentKnowledgeInput) error {
			_ = u.repo.UpdateKnowledgeDocumentFields(ctx, documentID, map[string]any{"processing_stage": "graph_extract"})
			if u.aiRuntime == nil {
				u.mergeDocumentMetadata(ctx, documentID, map[string]any{"graph_status": "skipped", "graph_error": "ai runtime not configured"})
				return kgraph.ErrPipelineSkipped
			}
			if err := u.buildKnowledgeGraphFromDocument(ictx, input.HouseholdID, input.BaseID, input.DocumentID, input.Title, input.TextContent); err != nil {
				u.mergeDocumentMetadata(ctx, documentID, map[string]any{"graph_status": "failed", "graph_error": err.Error()})
				return err
			}
			u.mergeDocumentMetadata(ctx, documentID, map[string]any{"graph_status": "ok", "graph_error": ""})
			return nil
		},
	}
	_ = kgraph.RunDocumentKnowledgePipeline(ctx, in, cb)
}

func (u *KnowledgeUsecase) buildKnowledgeGraphFromDocument(ctx context.Context, householdID, baseID, documentID int64, title, textContent string) error {
	textContent = strings.TrimSpace(sanitizeKnowledgeText(textContent))
	if textContent == "" {
		return nil
	}
	excerpt := excerptForKnowledgeGraph(textContent, maxGraphExcerptRunes)
	raw, err := u.aiRuntime.GenerateKnowledgeGraphTriplesJSON(ctx, title, excerpt)
	if err != nil {
		return err
	}
	triples, err := airuntime.ParseKnowledgeGraphTriplesJSON(raw)
	if err != nil {
		return fmt.Errorf("parse graph json: %w", err)
	}
	if err := u.repo.DeleteKnowledgeGraphEdgesByDocument(ctx, householdID, documentID); err != nil {
		return err
	}
	docKey := strconv.FormatInt(documentID, 10)
	baseKey := strconv.FormatInt(baseID, 10)
	meta := map[string]any{
		"document_id":       docKey,
		"knowledge_base_id": baseKey,
		"source":            kgExtractVersion,
	}
	var edges []*data.KnowledgeGraphEdge
	dishKeywords := make([]string, 0)
	dishSeen := map[string]struct{}{}
	for _, t := range triples {
		if !validKnowledgeTriple(t) {
			continue
		}
		subKind := strings.ToLower(strings.TrimSpace(t.SubjectKind))
		subID := normalizeGraphNodeID(subKind, t.SubjectID)
		objKind := strings.ToLower(strings.TrimSpace(t.ObjectKind))
		objID := normalizeGraphNodeID(objKind, t.ObjectID)
		pred := sanitizePredicate(t.Predicate)
		if subID == "" || objID == "" || pred == "" {
			continue
		}
		w := t.Weight
		if w <= 0 {
			w = 1
		}
		md := cloneMetadataJSON(meta)
		edges = append(edges, &data.KnowledgeGraphEdge{
			HouseholdID:  householdID,
			SubjectKind:  subKind,
			SubjectID:    subID,
			Predicate:    pred,
			ObjectKind:   objKind,
			ObjectID:     objID,
			Weight:       w,
			MetadataJSON: md,
		})
		if subKind == "dish" {
			kw := dishKeywordFromGraphID(subID)
			if kw != "" {
				if _, ok := dishSeen[kw]; !ok {
					dishSeen[kw] = struct{}{}
					dishKeywords = append(dishKeywords, kw)
				}
			}
		}
	}
	if len(edges) > 0 {
		if err := u.repo.CreateKnowledgeGraphEdgesBatch(ctx, edges); err != nil {
			return err
		}
	}
	return u.linkRecipesForDishKeywords(ctx, householdID, baseID, documentID, dishKeywords)
}

func cloneMetadataJSON(base map[string]any) map[string]any {
	out := make(map[string]any, len(base))
	for k, v := range base {
		out[k] = v
	}
	return out
}

func metadataString(meta map[string]any, key string) string {
	if meta == nil {
		return ""
	}
	raw, ok := meta[key]
	if !ok || raw == nil {
		return ""
	}
	switch v := raw.(type) {
	case string:
		return strings.TrimSpace(v)
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func metadataInt(meta map[string]any, key string) int {
	if meta == nil {
		return 0
	}
	raw, ok := meta[key]
	if !ok || raw == nil {
		return 0
	}
	switch v := raw.(type) {
	case int:
		return v
	case int32:
		return int(v)
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(v))
		return n
	default:
		return 0
	}
}

func metadataBool(meta map[string]any, key string) bool {
	if meta == nil {
		return false
	}
	raw, ok := meta[key]
	if !ok || raw == nil {
		return false
	}
	switch v := raw.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	default:
		return false
	}
}

func metadataTime(meta map[string]any, key string) time.Time {
	raw := metadataString(meta, key)
	if raw == "" {
		return time.Time{}
	}
	ts, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}
	}
	return ts
}

func knowledgeAsyncInProgress(doc *data.KnowledgeDocument) bool {
	if doc == nil || !metadataBool(doc.MetadataJSON, "extract_async_running") {
		return false
	}
	hb := metadataTime(doc.MetadataJSON, "extract_async_heartbeat_at")
	if hb.IsZero() {
		return true
	}
	return time.Since(hb) <= knowledgeAsyncHeartbeatTTL
}

func nonEmptyString(primary, fallback string) string {
	if strings.TrimSpace(primary) != "" {
		return strings.TrimSpace(primary)
	}
	return strings.TrimSpace(fallback)
}

func sanitizeKnowledgeText(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	clean := bytes.ToValidUTF8([]byte(raw), []byte{})
	text := stripKnowledgeProblemRunes(string(clean))
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	return strings.TrimSpace(text)
}

// stripKnowledgeProblemRunes 保守清理抽取文本里的控制字符和替换字符，避免 chunk/content/source_snippet 落库后出现明显乱码。
func stripKnowledgeProblemRunes(raw string) string {
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

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func nonZeroInt(values ...int) int {
	for _, v := range values {
		if v != 0 {
			return v
		}
	}
	return 0
}

func extractProcessedThroughPage(stats rag.ExtractStats) int {
	if stats.PageCount <= 0 {
		return 0
	}
	if stats.NextPage > 0 {
		if stats.NextPage <= 1 {
			return 0
		}
		return min(stats.PageCount, stats.NextPage-1)
	}
	if stats.LastPage > 0 {
		return min(stats.PageCount, stats.LastPage)
	}
	if stats.StartPage > 1 {
		return min(stats.PageCount, stats.StartPage-1)
	}
	return 0
}

func validKnowledgeTriple(t airuntime.KnowledgeGraphTriple) bool {
	return strings.TrimSpace(t.SubjectID) != "" &&
		strings.TrimSpace(t.ObjectID) != "" &&
		strings.TrimSpace(t.Predicate) != ""
}

func sanitizePredicate(p string) string {
	p = strings.TrimSpace(strings.ToLower(p))
	if p == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range p {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '_':
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeGraphNodeID(kind, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	lowerKind := strings.ToLower(strings.TrimSpace(kind))
	// 若模型已输出 dish:foo，则规范 kind 前缀
	if idx := strings.Index(raw, ":"); idx > 0 {
		prefix := strings.ToLower(strings.TrimSpace(raw[:idx]))
		rest := strings.TrimSpace(raw[idx+1:])
		if rest == "" {
			return ""
		}
		if prefix != "" && prefix == lowerKind {
			return prefix + ":" + rest
		}
		return prefix + ":" + rest
	}
	if lowerKind == "" {
		return raw
	}
	return lowerKind + ":" + raw
}

func dishKeywordFromGraphID(normalizedID string) string {
	normalizedID = strings.TrimSpace(normalizedID)
	normalizedID = strings.TrimPrefix(normalizedID, "dish:")
	return strings.TrimSpace(normalizedID)
}

func excerptForKnowledgeGraph(text string, maxRunes int) string {
	text = strings.TrimSpace(text)
	if maxRunes <= 0 || text == "" {
		return text
	}
	if utf8.RuneCountInString(text) <= maxRunes {
		return text
	}
	r := []rune(text)
	return string(r[:maxRunes])
}

func (u *KnowledgeUsecase) linkRecipesForDishKeywords(ctx context.Context, householdID, baseID, documentID int64, dishKeywords []string) error {
	if u.recipeRepo == nil || len(dishKeywords) == 0 {
		return nil
	}
	meta := map[string]any{
		"document_id":       strconv.FormatInt(documentID, 10),
		"knowledge_base_id": strconv.FormatInt(baseID, 10),
		"source":            "recipe_title_match_v1",
	}
	seen := map[string]struct{}{}
	var edges []*data.KnowledgeGraphEdge
	for _, kw := range dishKeywords {
		kw = strings.TrimSpace(kw)
		if kw == "" {
			continue
		}
		recipes, err := u.recipeRepo.ListLatest(ctx, householdID, 5, kw, "", true, "published")
		if err != nil {
			return err
		}
		subj := normalizeGraphNodeID("dish", kw)
		for _, rec := range recipes {
			key := subj + "|" + strconv.FormatInt(rec.ID, 10)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			edges = append(edges, &data.KnowledgeGraphEdge{
				HouseholdID:  householdID,
				SubjectKind:  "dish",
				SubjectID:    subj,
				Predicate:    "matched_recipe",
				ObjectKind:   "recipe",
				ObjectID:     strconv.FormatInt(rec.ID, 10),
				Weight:       1,
				MetadataJSON: cloneMetadataJSON(meta),
			})
		}
	}
	if len(edges) == 0 {
		return nil
	}
	return u.repo.CreateKnowledgeGraphEdgesBatch(ctx, edges)
}

// EnsureHouseholdAIKnowledgeBase 返回或创建「厨艺AI资料库」。
func (u *KnowledgeUsecase) EnsureHouseholdAIKnowledgeBase(ctx context.Context, householdID int64) (*data.KnowledgeBase, error) {
	bases, err := u.repo.ListBases(ctx, householdID)
	if err != nil {
		return nil, err
	}
	for _, b := range bases {
		if strings.TrimSpace(b.Name) == aiIngestKnowledgeBaseName {
			return b, nil
		}
	}
	return u.CreateBase(ctx, CreateKnowledgeBaseRequest{
		HouseholdID: householdID,
		Name:        aiIngestKnowledgeBaseName,
		Description: "厨艺 AI 对话中上传的文档自动归档至此知识库，并生成向量与知识图谱。",
	})
}

// IngestMediaAssetAsDocument 将已上传媒体按 AI 知识库入库（含向量与图谱流水线）。
func (u *KnowledgeUsecase) IngestMediaAssetAsDocument(ctx context.Context, householdID int64, assetID int64, title string) (*data.KnowledgeDocument, error) {
	base, err := u.EnsureHouseholdAIKnowledgeBase(ctx, householdID)
	if err != nil {
		return nil, err
	}
	return u.CreateDocument(ctx, CreateKnowledgeDocumentRequest{
		KnowledgeBaseID: base.ID,
		MediaAssetID:    assetID,
		Title:           title,
	})
}

// RunDocumentKnowledgeGraphPipeline 供 graph 包或异步任务调用：仅执行图谱片段+菜谱关联（假定向量已完成）。
func (u *KnowledgeUsecase) RunDocumentKnowledgeGraphPipeline(ctx context.Context, householdID, baseID, documentID int64, title, textContent string) error {
	base, err := u.repo.GetBase(ctx, baseID)
	if err != nil {
		return err
	}
	if base.HouseholdID != householdID {
		return errors.New("knowledge base household mismatch")
	}
	u.runKnowledgeGraphIngest(ctx, base, documentID, title, textContent)
	return nil
}
