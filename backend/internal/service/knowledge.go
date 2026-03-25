package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type KnowledgeService struct {
	v1.UnimplementedKnowledgeServiceServer

	usecase *biz.KnowledgeUsecase
}

func NewKnowledgeService(usecase *biz.KnowledgeUsecase) *KnowledgeService {
	return &KnowledgeService{usecase: usecase}
}

func (s *KnowledgeService) CreateKnowledgeBase(ctx context.Context, req *v1.CreateKnowledgeBaseRequest) (*v1.CreateKnowledgeBaseReply, error) {
	actor := biz.ActorFromContext(ctx)
	base, err := s.usecase.CreateBase(ctx, biz.CreateKnowledgeBaseRequest{
		HouseholdID: actor.HouseholdID,
		Name:        req.GetName(),
		Description: req.GetDescription(),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateKnowledgeBaseReply{Base: toProtoKnowledgeBase(base)}, nil
}

func (s *KnowledgeService) ListKnowledgeBases(ctx context.Context, _ *v1.ListKnowledgeBasesRequest) (*v1.ListKnowledgeBasesReply, error) {
	actor := biz.ActorFromContext(ctx)
	items, err := s.usecase.ListBases(ctx, actor.HouseholdID)
	if err != nil {
		return nil, err
	}

	bases := make([]*v1.KnowledgeBase, 0, len(items))
	for _, item := range items {
		bases = append(bases, toProtoKnowledgeBase(item))
	}
	return &v1.ListKnowledgeBasesReply{Bases: bases}, nil
}

func (s *KnowledgeService) CreateKnowledgeDocument(ctx context.Context, req *v1.CreateKnowledgeDocumentRequest) (*v1.CreateKnowledgeDocumentReply, error) {
	document, err := s.usecase.CreateDocument(ctx, biz.CreateKnowledgeDocumentRequest{
		KnowledgeBaseID: req.GetKnowledgeBaseId(),
		MediaAssetID:    req.GetMediaAssetId(),
		Title:           req.GetTitle(),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateKnowledgeDocumentReply{Document: toProtoKnowledgeDocument(document)}, nil
}

func (s *KnowledgeService) ListKnowledgeDocuments(ctx context.Context, req *v1.ListKnowledgeDocumentsRequest) (*v1.ListKnowledgeDocumentsReply, error) {
	items, err := s.usecase.ListDocuments(ctx, req.GetKnowledgeBaseId())
	if err != nil {
		return nil, err
	}

	documents := make([]*v1.KnowledgeDocument, 0, len(items))
	for _, item := range items {
		documents = append(documents, toProtoKnowledgeDocument(item))
	}
	return &v1.ListKnowledgeDocumentsReply{Documents: documents}, nil
}

func (s *KnowledgeService) ReindexKnowledgeBase(ctx context.Context, req *v1.ReindexKnowledgeBaseRequest) (*v1.ReindexKnowledgeBaseReply, error) {
	if err := s.usecase.Reindex(ctx, req.GetKnowledgeBaseId()); err != nil {
		return nil, err
	}
	return &v1.ReindexKnowledgeBaseReply{Status: "ok"}, nil
}

func (s *KnowledgeService) QueryKnowledgeBase(ctx context.Context, req *v1.QueryKnowledgeBaseRequest) (*v1.QueryKnowledgeBaseReply, error) {
	result, err := s.usecase.Query(ctx, req.GetKnowledgeBaseId(), req.GetQuestion())
	if err != nil {
		return nil, err
	}
	return &v1.QueryKnowledgeBaseReply{
		Answer:  result.Answer,
		Sources: toProtoSources(result.Sources),
		Mode:    result.Mode,
	}, nil
}
