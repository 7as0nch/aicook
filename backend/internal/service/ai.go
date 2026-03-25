package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type AIService struct {
	v1.UnimplementedAIServiceServer

	usecase *biz.AIUsecase
}

func NewAIService(usecase *biz.AIUsecase) *AIService {
	return &AIService{usecase: usecase}
}

func (s *AIService) CreateSession(ctx context.Context, req *v1.CreateSessionRequest) (*v1.CreateSessionReply, error) {
	actor := biz.ActorFromContext(ctx)
	session, err := s.usecase.CreateSession(ctx, biz.CreateSessionRequest{
		HouseholdID: actor.HouseholdID,
		UserID:      actor.UserID,
		Scene:       req.GetScene(),
		Title:       req.GetTitle(),
		RecipeID:    req.RecipeId,
		ContextJSON: structToJSONRaw(req.GetContext()),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateSessionReply{Session: toProtoAISession(session)}, nil
}

func (s *AIService) SendMessage(ctx context.Context, req *v1.SendMessageRequest) (*v1.SendMessageReply, error) {
	reply, err := s.usecase.SendMessage(ctx, req.GetSessionId(), biz.SendMessageRequest{
		Text:         req.GetText(),
		Scene:        req.GetScene(),
		Attachments:  fromProtoAttachments(req.GetAttachments()),
		QuoteContext: fromProtoQuoteContext(req.GetQuoteContext()),
	})
	if err != nil {
		return nil, err
	}

	return &v1.SendMessageReply{
		Session:          toProtoAISession(reply.Session),
		UserMessage:      toProtoAIMessage(reply.User),
		AssistantMessage: toProtoAIMessage(reply.Assistant),
		ReplyContent:     reply.Reply.Content,
		ReplyMode:        string(reply.Reply.Mode),
		ReplySources:     toProtoSources(reply.Reply.Sources),
	}, nil
}
