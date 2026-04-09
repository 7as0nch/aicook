package biz

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
	"github.com/pgvector/pgvector-go"
	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	kgraph "github.com/chengjiang/aicook/backend/internal/platform/airuntime/graph"
	"github.com/chengjiang/aicook/backend/internal/platform/embeddings"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
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
	// knowledgePDFExtractTimeout PDF 纯文本抽取最长时间；ledongthuc/pdf 对部分大文件可能极慢或阻塞。
	knowledgePDFExtractTimeout = 5 * time.Minute
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
	Title           string `json:"title"`
	ProcessingStage string `json:"processing_stage"`
	Status          string `json:"status"`
	ChunkCount      int    `json:"chunk_count"`
	StageLabel      string `json:"stage_label"`
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
	case "done", "extract_empty", "error", "extract_timeout", "extract_skipped_large":
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
	case "chunk_embed":
		return "切块与向量索引…"
	case "done":
		return "已完成"
	case "extract_empty":
		return "无文本可索引"
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

	rollbackFailed := func(msg string) {
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":           "failed",
			"processing_stage": "error",
			"summary":          document.Summary + " | " + msg,
		})
	}

	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "download"})
	payload, err := u.objectStorage.GetObject(ctx, asset.Bucket, asset.ObjectKey)
	if err != nil {
		rollbackFailed("拉取对象失败")
		return u.repo.GetDocument(ctx, document.ID)
	}

	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "extract"})
	effectiveCT := effectiveContentTypeForKnowledgeExtract(asset.ContentType, asset.FileName, payload)
	payloadN := len(payload)
	if int64(payloadN) > maxKnowledgeIngestPayloadBytes {
		note := fmt.Sprintf("文件超过知识库单文档大小上限（%d MB），已跳过解析。", maxKnowledgeIngestPayloadBytes/(1<<20))
		slog.Warn("knowledge ingest payload over limit",
			"document_id", document.ID,
			"payload_bytes", payloadN,
			"limit_bytes", maxKnowledgeIngestPayloadBytes,
		)
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":             "failed",
			"processing_stage":   "extract_skipped_large",
			"summary":            document.Summary + " | " + note,
		})
		return u.repo.GetDocument(ctx, document.ID)
	}

	slog.Info("knowledge document extract start",
		"document_id", document.ID,
		"payload_bytes", payloadN,
		"effective_content_type", effectiveCT,
	)
	extractStart := time.Now()
	var textContent string
	var pdfTimedOut bool
	if strings.Contains(strings.ToLower(effectiveCT), "pdf") {
		textContent, pdfTimedOut = extractPDFPlainTextWithTimeout(payload, knowledgePDFExtractTimeout)
	} else {
		textContent = extractTextContent(effectiveCT, payload)
	}
	slog.Info("knowledge document extract end",
		"document_id", document.ID,
		"duration_ms", time.Since(extractStart).Milliseconds(),
		"pdf_timed_out", pdfTimedOut,
		"text_runes", utf8.RuneCountInString(textContent),
	)
	if pdfTimedOut {
		note := fmt.Sprintf("PDF 文本解析超时（%s），可拆分为较小文件或使用纯文本/Markdown 上传。", knowledgePDFExtractTimeout)
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"status":             "failed",
			"processing_stage":   "extract_timeout",
			"summary":            document.Summary + " | " + note,
		})
		return u.repo.GetDocument(ctx, document.ID)
	}

	status := "uploaded"
	if textContent != "" {
		status = "indexed"
	}
	updates := map[string]any{
		"text_content":      textContent,
		"processing_stage": "chunk_embed",
		"status":             status,
	}
	if strings.TrimSpace(effectiveCT) != strings.TrimSpace(asset.ContentType) {
		updates["content_type"] = effectiveCT
	}
	_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, updates)

	if textContent != "" {
		if err := u.replaceDocumentChunks(ctx, base, document.ID, textContent); err != nil {
			rollbackFailed("切块/索引失败")
			return u.repo.GetDocument(ctx, document.ID)
		}
		u.runKnowledgeGraphIngest(ctx, base, document.ID, title, textContent)
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{"processing_stage": "done"})
	} else {
		note := "未能从文件中解析出可读文本（常见原因：MIME 为 application/octet-stream、PDF 扫描版无文本层、或格式不受支持），因此未生成 chunks / 向量。"
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, document.ID, map[string]any{
			"processing_stage": "extract_empty",
			"summary":          document.Summary + " | " + note,
		})
	}
	return u.repo.GetDocument(ctx, document.ID)
}

func (u *KnowledgeUsecase) ListDocuments(ctx context.Context, baseID int64) ([]*data.KnowledgeDocument, error) {
	return u.repo.ListDocuments(ctx, baseID)
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
		if err := u.replaceDocumentChunks(ctx, base, doc.ID, doc.TextContent); err != nil {
			return err
		}
		u.runKnowledgeGraphIngest(ctx, base, doc.ID, doc.Title, doc.TextContent)
		_ = u.repo.UpdateKnowledgeDocumentFields(ctx, doc.ID, map[string]any{"processing_stage": "done"})
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

func extractTextContent(contentType string, data []byte) string {
	lower := strings.ToLower(contentType)
	switch {
	case strings.Contains(lower, "text/plain"),
		strings.Contains(lower, "text/markdown"),
		strings.Contains(lower, "application/json"),
		strings.Contains(lower, "application/xml"):
		return string(data)
	case strings.Contains(lower, "pdf"):
		return extractPDFPlainText(data)
	default:
		return ""
	}
}

// effectiveContentTypeForKnowledgeExtract 在浏览器/网关把文件标成 octet-stream 时，用魔数与扩展名还原类型，否则 extractTextContent 会得到空串、chunks 表无数据。
func effectiveContentTypeForKnowledgeExtract(declared, fileName string, payload []byte) string {
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
	}
	const maxTextHeuristic = 512 * 1024
	if len(payload) > 0 && len(payload) <= maxTextHeuristic && utf8.Valid(payload) && mostlyPrintableTextPayload(payload) {
		return "text/plain; charset=utf-8"
	}
	return ct
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

// extractPDFPlainTextWithTimeout 在单独 goroutine 中跑 ledongthuc/pdf，超时返回 timedOut=true（解析 goroutine 仍会在后台跑完，避免重复进入则无妨）。
func extractPDFPlainTextWithTimeout(data []byte, timeout time.Duration) (text string, timedOut bool) {
	if timeout <= 0 {
		return extractPDFPlainText(data), false
	}
	ch := make(chan string, 1)
	go func() {
		ch <- extractPDFPlainText(data)
	}()
	select {
	case text = <-ch:
		return text, false
	case <-time.After(timeout):
		slog.Warn("pdf plain text extract timed out", "timeout", timeout.String(), "payload_bytes", len(data))
		return "", true
	}
}

func (u *KnowledgeUsecase) replaceDocumentChunks(ctx context.Context, base *data.KnowledgeBase, documentID int64, textContent string) error {
	chunks := buildChunks(base.ID, documentID, textContent, base.DefaultChunkSize)
	u.fillChunkEmbeddings(ctx, chunks)
	return u.repo.ReplaceChunks(ctx, documentID, chunks)
}

func (u *KnowledgeUsecase) fillChunkEmbeddings(ctx context.Context, chunks []*data.KnowledgeChunk) {
	if u.embedder == nil || len(chunks) == 0 {
		return
	}
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.Content
	}
	vecs, err := u.embedder.EmbedBatch(ctx, texts)
	if err != nil || len(vecs) != len(chunks) {
		return
	}
	for i := range chunks {
		if len(vecs[i]) != embeddings.Dimensions {
			continue
		}
		v := pgvector.NewVector(vecs[i])
		chunks[i].Embedding = &v
	}
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
	if err != nil || len(vec) != embeddings.Dimensions {
		return nil
	}
	return vec
}

func buildChunks(baseID, documentID int64, content string, chunkSize int) []*data.KnowledgeChunk {
	text := strings.TrimSpace(content)
	if text == "" {
		return nil
	}
	if chunkSize <= 0 {
		chunkSize = 1200
	}

	runes := []rune(text)
	chunks := make([]*data.KnowledgeChunk, 0)
	for start, idx := 0, 1; start < len(runes); start, idx = start+chunkSize, idx+1 {
		end := start + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		part := string(runes[start:end])
		chunks = append(chunks, &data.KnowledgeChunk{
			KnowledgeBaseID: baseID,
			DocumentID:      documentID,
			ChunkNo:         idx,
			Content:         part,
			SourceSnippet:   preview(part, 120),
			TokenSize:       len([]rune(part)),
		})
	}
	return chunks
}

func preview(raw string, size int) string {
	runes := []rune(strings.TrimSpace(raw))
	if len(runes) <= size {
		return string(runes)
	}
	return string(runes[:size]) + "..."
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
				Title:        fmt.Sprintf("%s · 片段 #%d", base.Name, chunk.ChunkNo),
				DocumentID: strconv.FormatInt(chunk.DocumentID, 10),
				Snippet:      chunk.SourceSnippet,
				SourceKind:   airuntime.SourceKindKnowledgeBase,
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
		BaseID:        base.ID,
		DocumentID:  documentID,
		Title:         title,
		TextContent:   textContent,
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
	textContent = strings.TrimSpace(textContent)
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
