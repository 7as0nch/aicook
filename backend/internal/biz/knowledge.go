package biz

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
)

type KnowledgeRepo interface {
	CreateBase(ctx context.Context, base *data.KnowledgeBase) error
	ListBases(ctx context.Context, householdID int64) ([]*data.KnowledgeBase, error)
	GetBase(ctx context.Context, id int64) (*data.KnowledgeBase, error)
	CreateDocument(ctx context.Context, document *data.KnowledgeDocument) error
	ListDocuments(ctx context.Context, baseID int64) ([]*data.KnowledgeDocument, error)
	ReplaceChunks(ctx context.Context, documentID int64, chunks []*data.KnowledgeChunk) error
	SearchChunks(ctx context.Context, baseID int64, query string, limit int) ([]*data.KnowledgeChunk, error)
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

type KnowledgeUsecase struct {
	repo            KnowledgeRepo
	mediaRepo       MediaRepo
	objectStorage   storage.ObjectStorage
	knowledgeBucket string
	aiRuntime       *airuntime.Runtime
}

func NewKnowledgeUsecase(repo *data.KnowledgeRepo, mediaRepo *data.MediaRepo, objectStorage storage.ObjectStorage, cfg *conf.Bootstrap, aiRuntime *airuntime.Runtime) *KnowledgeUsecase {
	return &KnowledgeUsecase{
		repo:            repo,
		mediaRepo:       mediaRepo,
		objectStorage:   objectStorage,
		knowledgeBucket: cfg.GetOss().GetKnowledgeBucket(),
		aiRuntime:       aiRuntime,
	}
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

func (u *KnowledgeUsecase) CreateDocument(ctx context.Context, req CreateKnowledgeDocumentRequest) (*data.KnowledgeDocument, error) {
	base, err := u.repo.GetBase(ctx, req.KnowledgeBaseID)
	if err != nil {
		return nil, err
	}

	asset, err := u.mediaRepo.Get(ctx, req.MediaAssetID)
	if err != nil {
		return nil, err
	}

	payload, err := u.objectStorage.GetObject(ctx, asset.Bucket, asset.ObjectKey)
	if err != nil {
		return nil, err
	}

	textContent := extractTextContent(asset.ContentType, payload)
	status := "uploaded"
	if textContent != "" {
		status = "indexed"
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
		Status:          status,
		TextContent:     textContent,
		Summary:         fmt.Sprintf("来源资源: %s", asset.StorageURL),
	}
	if err := u.repo.CreateDocument(ctx, document); err != nil {
		return nil, err
	}

	if textContent != "" {
		chunks := buildChunks(base.ID, document.ID, textContent, base.DefaultChunkSize)
		if err := u.repo.ReplaceChunks(ctx, document.ID, chunks); err != nil {
			return nil, err
		}
	}
	return document, nil
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
		chunks := buildChunks(base.ID, doc.ID, doc.TextContent, base.DefaultChunkSize)
		if err := u.repo.ReplaceChunks(ctx, doc.ID, chunks); err != nil {
			return err
		}
	}
	return nil
}

func (u *KnowledgeUsecase) Query(ctx context.Context, baseID int64, question string) (*QueryResult, error) {
	chunks, err := u.repo.SearchChunks(ctx, baseID, question, 4)
	if err != nil {
		return nil, err
	}

	sources := make([]airuntime.Source, 0, len(chunks))
	for _, chunk := range chunks {
		sources = append(sources, airuntime.Source{
			Title:      fmt.Sprintf("知识片段 #%d", chunk.ChunkNo),
			DocumentID: strconv.FormatInt(chunk.DocumentID, 10),
			Snippet:    chunk.SourceSnippet,
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
	switch {
	case strings.Contains(contentType, "text/plain"),
		strings.Contains(contentType, "text/markdown"),
		strings.Contains(contentType, "application/json"),
		strings.Contains(contentType, "application/xml"):
		return string(data)
	default:
		return ""
	}
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
