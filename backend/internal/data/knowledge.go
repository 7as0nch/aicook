package data

import (
	"context"
	"strings"

	"gorm.io/gorm"
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

func (r *KnowledgeRepo) ListDocuments(ctx context.Context, baseID int64) ([]*KnowledgeDocument, error) {
	var docs []*KnowledgeDocument
	err := r.db.WithContext(ctx).Where("knowledge_base_id = ?", baseID).Order("created_at DESC").Find(&docs).Error
	return docs, err
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

func (r *KnowledgeRepo) SearchChunks(ctx context.Context, baseID int64, query string, limit int) ([]*KnowledgeChunk, error) {
	if limit <= 0 {
		limit = 4
	}
	query = strings.TrimSpace(query)
	var chunks []*KnowledgeChunk
	db := r.db.WithContext(ctx).Where("knowledge_base_id = ?", baseID)
	if query != "" {
		db = db.Where("content ILIKE ?", "%"+query+"%")
	}
	err := db.Order("created_at DESC").Limit(limit).Find(&chunks).Error
	return chunks, err
}
