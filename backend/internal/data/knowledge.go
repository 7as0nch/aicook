package data

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/pgvector/pgvector-go"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/chengjiang/aicook/backend/internal/platform/embeddings"
)

type KnowledgeRepo struct {
	db *gorm.DB
}

func NewKnowledgeRepo(db *gorm.DB) *KnowledgeRepo {
	return &KnowledgeRepo{db: db}
}

func (r *KnowledgeRepo) CreateBase(ctx context.Context, base *KnowledgeBase) error {
	return r.db.WithContext(ctx).Create(base).Error
}

func (r *KnowledgeRepo) ListBases(ctx context.Context, householdID int64) ([]*KnowledgeBase, error) {
	var bases []*KnowledgeBase
	err := r.db.WithContext(ctx).Where("household_id = ?", householdID).Order("created_at DESC").Find(&bases).Error
	return bases, err
}

func (r *KnowledgeRepo) GetBase(ctx context.Context, id int64) (*KnowledgeBase, error) {
	var base KnowledgeBase
	if err := r.db.WithContext(ctx).First(&base, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &base, nil
}

func (r *KnowledgeRepo) CreateDocument(ctx context.Context, document *KnowledgeDocument) error {
	return r.db.WithContext(ctx).Create(document).Error
}

func (r *KnowledgeRepo) GetDocument(ctx context.Context, id int64) (*KnowledgeDocument, error) {
	var doc KnowledgeDocument
	if err := r.db.WithContext(ctx).First(&doc, "id = ?", id).Error; err != nil {
		return nil, err
	}
	var n int64
	_ = r.db.WithContext(ctx).Model(&KnowledgeChunk{}).Where("document_id = ?", id).Count(&n).Error
	doc.ChunkCount = int(n)
	return &doc, nil
}

// GetLatestDocumentByMediaAssetID 按家庭 + 媒体资源查找最近一次入库的文档（厨艺 AI 与知识库页共用）。
func (r *KnowledgeRepo) GetLatestDocumentByMediaAssetID(ctx context.Context, householdID, mediaAssetID int64) (*KnowledgeDocument, error) {
	var doc KnowledgeDocument
	err := r.db.WithContext(ctx).
		Model(&KnowledgeDocument{}).
		Joins("JOIN knowledge_bases ON knowledge_bases.id = knowledge_documents.knowledge_base_id").
		Where("knowledge_bases.household_id = ? AND knowledge_documents.media_asset_id = ?", householdID, mediaAssetID).
		Order("knowledge_documents.id DESC").
		First(&doc).Error
	if err != nil {
		return nil, err
	}
	var n int64
	_ = r.db.WithContext(ctx).Model(&KnowledgeChunk{}).Where("document_id = ?", doc.ID).Count(&n).Error
	doc.ChunkCount = int(n)
	return &doc, nil
}

func (r *KnowledgeRepo) UpdateKnowledgeDocumentFields(ctx context.Context, id int64, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(&KnowledgeDocument{}).Where("id = ?", id).Updates(updates).Error
}

func (r *KnowledgeRepo) ListDocuments(ctx context.Context, baseID int64) ([]*KnowledgeDocument, error) {
	var docs []*KnowledgeDocument
	err := r.db.WithContext(ctx).Where("knowledge_base_id = ?", baseID).Order("created_at DESC").Find(&docs).Error
	if err != nil || len(docs) == 0 {
		return docs, err
	}
	ids := make([]int64, len(docs))
	for i, d := range docs {
		ids[i] = d.ID
	}
	type chunkAgg struct {
		DocumentID int64 `gorm:"column:document_id"`
		N          int64 `gorm:"column:n"`
	}
	var agg []chunkAgg
	if err := r.db.WithContext(ctx).Model(&KnowledgeChunk{}).
		Select("document_id, COUNT(*) AS n").
		Where("document_id IN ?", ids).
		Group("document_id").
		Find(&agg).Error; err != nil {
		return docs, err
	}
	byDoc := make(map[int64]int64, len(agg))
	for _, a := range agg {
		byDoc[a.DocumentID] = a.N
	}
	for _, d := range docs {
		d.ChunkCount = int(byDoc[d.ID])
	}
	return docs, nil
}

func (r *KnowledgeRepo) CreateHouseholdAIMemory(ctx context.Context, row *HouseholdAIMemory) error {
	return r.db.WithContext(ctx).Create(row).Error
}

func (r *KnowledgeRepo) ReplaceChunks(ctx context.Context, documentID int64, chunks []*KnowledgeChunk) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("document_id = ?", documentID).Delete(&KnowledgeChunk{}).Error; err != nil {
			return err
		}
		if len(chunks) == 0 {
			return nil
		}
		return tx.Create(&chunks).Error
	})
}

// SearchChunks 优先向量（queryVec 为 1536 维且库中存在 embedding），否则 to_tsvector 全文排序，再退回 ILIKE。
func (r *KnowledgeRepo) SearchChunks(ctx context.Context, baseID int64, query string, queryVec []float32, limit int) ([]*KnowledgeChunk, error) {
	if limit <= 0 {
		limit = 4
	}
	query = strings.TrimSpace(query)

	if len(queryVec) == embeddings.Dimensions {
		var chunks []*KnowledgeChunk
		q := r.db.WithContext(ctx).Where("knowledge_base_id = ? AND embedding IS NOT NULL", baseID)
		q = q.Clauses(clause.OrderBy{
			Expression: clause.Expr{SQL: "embedding <=> ?::vector", Vars: []any{pgvector.NewVector(queryVec)}},
		})
		if err := q.Limit(limit).Find(&chunks).Error; err != nil {
			return nil, err
		}
		if len(chunks) > 0 {
			return chunks, nil
		}
	}

	if query != "" {
		var chunks []*KnowledgeChunk
		tx := r.db.WithContext(ctx).Model(&KnowledgeChunk{}).Where("knowledge_base_id = ?", baseID)
		tx = tx.Where("to_tsvector('simple', content) @@ plainto_tsquery('simple', ?)", query)
		tx = tx.Order(gorm.Expr("ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', ?)) DESC", query))
		if err := tx.Limit(limit).Find(&chunks).Error; err == nil && len(chunks) > 0 {
			return chunks, nil
		}
		var fallback []*KnowledgeChunk
		err := r.db.WithContext(ctx).
			Where("knowledge_base_id = ? AND content ILIKE ?", baseID, "%"+query+"%").
			Order("created_at DESC").
			Limit(limit).
			Find(&fallback).Error
		return fallback, err
	}

	var chunks []*KnowledgeChunk
	err := r.db.WithContext(ctx).Where("knowledge_base_id = ?", baseID).Order("created_at DESC").Limit(limit).Find(&chunks).Error
	return chunks, err
}

// ListHouseholdAIMemories 返回未过期记忆，按更新时间倒序。
func (r *KnowledgeRepo) ListHouseholdAIMemories(ctx context.Context, householdID int64, limit int) ([]*HouseholdAIMemory, error) {
	if limit <= 0 {
		limit = 8
	}
	var rows []*HouseholdAIMemory
	now := time.Now().UTC()
	q := r.db.WithContext(ctx).Where("household_id = ?", householdID).
		Where("(expires_at IS NULL OR expires_at > ?)", now).
		Order("updated_at DESC").
		Limit(limit)
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// SearchKnowledgeGraphEdges 按 household 与问题关键词在主体/客体/谓词上做简单匹配。
func (r *KnowledgeRepo) SearchKnowledgeGraphEdges(ctx context.Context, householdID int64, query string, limit int) ([]*KnowledgeGraphEdge, error) {
	if limit <= 0 {
		limit = 8
	}
	q := strings.TrimSpace(query)
	var rows []*KnowledgeGraphEdge
	db := r.db.WithContext(ctx).Where("household_id = ?", householdID)
	if q != "" {
		like := "%" + q + "%"
		db = db.Where("subject_id ILIKE ? OR object_id ILIKE ? OR predicate ILIKE ?", like, like, like)
	}
	err := db.Order("updated_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// DeleteKnowledgeGraphEdgesByDocument 删除该文档在图谱中产生的边（metadata_json.document_id 匹配）。
func (r *KnowledgeRepo) DeleteKnowledgeGraphEdgesByDocument(ctx context.Context, householdID, documentID int64) error {
	if householdID <= 0 || documentID <= 0 {
		return nil
	}
	docKey := strconv.FormatInt(documentID, 10)
	return r.db.WithContext(ctx).
		Where("household_id = ? AND metadata_json->>'document_id' = ?", householdID, docKey).
		Delete(&KnowledgeGraphEdge{}).Error
}

// CreateKnowledgeGraphEdgesBatch 批量写入图谱边（每条须预填 HouseholdID 与四元组字段）。
func (r *KnowledgeRepo) CreateKnowledgeGraphEdgesBatch(ctx context.Context, edges []*KnowledgeGraphEdge) error {
	if len(edges) == 0 {
		return nil
	}
	const batchSize = 80
	return r.db.WithContext(ctx).CreateInBatches(edges, batchSize).Error
}
