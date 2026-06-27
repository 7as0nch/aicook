package user

import (
	"context"
	"time"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/data"
)

// FeedbackService 用户意见反馈 HTTP/gRPC handler，薄封装委托 biz。
type FeedbackService struct {
	v1.UnimplementedFeedbackServiceServer

	usecase *user.FeedbackUsecase
}

func NewFeedbackService(usecase *user.FeedbackUsecase) *FeedbackService {
	return &FeedbackService{usecase: usecase}
}

func (s *FeedbackService) CreateFeedback(ctx context.Context, req *v1.CreateFeedbackRequest) (*v1.CreateFeedbackReply, error) {
	entry, err := s.usecase.Create(ctx, common.ActorFromContext(ctx), user.CreateFeedbackInput{
		Category:      req.GetCategory(),
		Content:       req.GetContent(),
		Contact:       req.GetContact(),
		ImageAssetIDs: req.GetImageAssetIds(),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateFeedbackReply{Feedback: s.toProtoFeedback(ctx, entry)}, nil
}

func (s *FeedbackService) ListFeedbacks(ctx context.Context, req *v1.ListFeedbacksRequest) (*v1.ListFeedbacksReply, error) {
	items, nextCursor, err := s.usecase.List(ctx, common.ActorFromContext(ctx), int(req.GetLimit()), req.GetBeforeId())
	if err != nil {
		return nil, err
	}
	out := make([]*v1.Feedback, 0, len(items))
	for _, it := range items {
		if it == nil {
			continue
		}
		out = append(out, s.toProtoFeedback(ctx, it))
	}
	return &v1.ListFeedbacksReply{Feedbacks: out, NextCursor: nextCursor}, nil
}

// toProtoFeedback 把存储模型转为 proto；时间统一 RFC3339；截图 id 解析成预签名 URL。
func (s *FeedbackService) toProtoFeedback(ctx context.Context, f *data.Feedback) *v1.Feedback {
	if f == nil {
		return nil
	}
	repliedAt := ""
	if f.RepliedAt != nil && !f.RepliedAt.IsZero() {
		repliedAt = f.RepliedAt.Format(time.RFC3339)
	}
	createdAt := ""
	if !f.CreatedAt.IsZero() {
		createdAt = f.CreatedAt.Format(time.RFC3339)
	}
	return &v1.Feedback{
		Id:         f.ID,
		Category:   f.Category,
		Content:    f.Content,
		ImageUrls:  s.usecase.SignedImageURLs(ctx, f.ImageAssetIDs),
		Contact:    f.Contact,
		Status:     f.Status,
		AdminReply: f.AdminReply,
		RepliedAt:  repliedAt,
		CreatedAt:  createdAt,
	}
}
