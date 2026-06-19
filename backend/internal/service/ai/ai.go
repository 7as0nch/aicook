package ai

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/ai"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/service/convert"
)

type AIService struct {
	v1.UnimplementedAIServiceServer

	usecase *ai.AIUsecase
	media   *user.MediaUsecase
}

func NewAIService(usecase *ai.AIUsecase, media *user.MediaUsecase) *AIService {
	return &AIService{usecase: usecase, media: media}
}

func (s *AIService) CreateSession(ctx context.Context, req *v1.CreateSessionRequest) (*v1.CreateSessionReply, error) {
	actor := common.ActorFromContext(ctx)
	session, err := s.usecase.CreateSession(ctx, ai.CreateSessionRequest{
		HouseholdID: actor.HouseholdID,
		UserID:      actor.UserID,
		Scene:       req.GetScene(),
		Title:       req.GetTitle(),
		RecipeID:    req.RecipeId,
		ContextJSON: convert.StructToJSONRaw(req.GetContext()),
	})
	if err != nil {
		return nil, err
	}
	return &v1.CreateSessionReply{Session: convert.ToProtoAISession(session)}, nil
}

func (s *AIService) SendMessage(ctx context.Context, req *v1.SendMessageRequest) (*v1.SendMessageReply, error) {
	reply, err := s.usecase.SendMessage(ctx, req.GetSessionId(), ai.SendMessageRequest{
		Text:         req.GetText(),
		Scene:        req.GetScene(),
		Attachments:  convert.FromProtoAttachments(req.GetAttachments()),
		QuoteContext: convert.FromProtoQuoteContext(req.GetQuoteContext()),
	})
	if err != nil {
		return nil, err
	}

	userMsg := convert.ToProtoAIMessage(reply.User)
	convert.SignAIMessageMedia(ctx, s.media, userMsg)
	return &v1.SendMessageReply{
		Session:          convert.ToProtoAISession(reply.Session),
		UserMessage:      userMsg,
		AssistantMessage: convert.ToProtoAIMessage(reply.Assistant),
		ReplyContent:     reply.Reply.Content,
		ReplyMode:        string(reply.Reply.Mode),
		ReplySources:     convert.ToProtoSources(reply.Reply.Sources),
	}, nil
}

func (s *AIService) ListSessions(ctx context.Context, req *v1.ListSessionsRequest) (*v1.ListSessionsReply, error) {
	sessions, err := s.usecase.ListSessions(ctx, ai.ListSessionsRequest{
		Scene: req.GetScene(),
		Limit: int(req.GetLimit()),
	})
	if err != nil {
		return nil, err
	}

	reply := &v1.ListSessionsReply{
		Sessions: make([]*v1.AISession, 0, len(sessions)),
	}
	for _, session := range sessions {
		reply.Sessions = append(reply.Sessions, convert.ToProtoAISession(session))
	}
	return reply, nil
}

func (s *AIService) ListMessages(ctx context.Context, req *v1.ListMessagesRequest) (*v1.ListMessagesReply, error) {
	session, messages, hasMore, err := s.usecase.ListMessagesPage(ctx, ai.ListMessagesRequest{
		SessionID:       req.GetSessionId(),
		Limit:           int(req.GetLimit()),
		BeforeMessageID: req.GetBeforeMessageId(),
	})
	if err != nil {
		return nil, err
	}

	reply := &v1.ListMessagesReply{
		Session:  convert.ToProtoAISession(session),
		Messages: make([]*v1.AIMessage, 0, len(messages)),
		HasMore:  hasMore,
	}
	for _, message := range messages {
		pm := convert.ToProtoAIMessage(message)
		convert.SignAIMessageMedia(ctx, s.media, pm) // 历史图片附件按 host/path 重签，前端可直接预览
		reply.Messages = append(reply.Messages, pm)
	}
	return reply, nil
}

func (s *AIService) DeleteSession(ctx context.Context, req *v1.DeleteSessionRequest) (*v1.DeleteSessionReply, error) {
	if err := s.usecase.DeleteSession(ctx, req.GetSessionId()); err != nil {
		return nil, err
	}
	return &v1.DeleteSessionReply{SessionId: req.GetSessionId()}, nil
}
