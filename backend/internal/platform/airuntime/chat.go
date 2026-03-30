package airuntime

import (
	"context"
	"fmt"
	"strings"

	einomodel "github.com/cloudwego/eino/components/model"
	einoopenai "github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/schema"
)

func replyHasSubstantivePayload(reply *ReplyResponse) bool {
	if reply == nil {
		return false
	}
	if strings.TrimSpace(reply.Content) != "" {
		return true
	}
	if strings.TrimSpace(reply.ReasoningContent) != "" {
		return true
	}
	md := reply.Metadata
	if md.RecipeCard != nil || md.PendingApproval != nil {
		return true
	}
	if len(md.ToolCalls) > 0 || len(md.Workflow) > 0 {
		return true
	}
	return false
}

func (r *Runtime) Reply(ctx context.Context, req ReplyRequest) (*ReplyResponse, error) {
	reply, err := r.runWithADK(ctx, req, nil)
	if err != nil {
		return nil, err
	}
	if !replyHasSubstantivePayload(reply) {
		return nil, fmt.Errorf("model returned empty answer")
	}
	return reply, nil
}

func (r *Runtime) StreamReply(ctx context.Context, req ReplyRequest, onChunk func(StreamEvent) error) (*ReplyResponse, error) {
	reply, err := r.runWithADK(ctx, req, onChunk)
	if err != nil {
		return nil, err
	}
	if !replyHasSubstantivePayload(reply) {
		return nil, fmt.Errorf("model returned empty answer")
	}
	return reply, nil
}

func (r *Runtime) generateMessage(ctx context.Context, model *einoopenai.ChatModel, messages []*schema.Message, opts ...einomodel.Option) (*schema.Message, error) {
	if model == nil {
		return nil, fmt.Errorf("chat model is not configured")
	}
	msg, err := model.Generate(ctx, messages, opts...)
	if err != nil {
		return nil, err
	}
	if msg == nil {
		return nil, fmt.Errorf("empty completion message")
	}
	return msg, nil
}

func buildCallOptions(req ReplyRequest) []einomodel.Option {
	options := []einomodel.Option{
		einomodel.WithTemperature(0.2),
		einoopenai.WithResponseMessageModifier(reasoningResponseModifier),
		einoopenai.WithResponseChunkMessageModifier(reasoningChunkModifier),
	}
	if req.ReasoningEnabled {
		options = append(
			options,
			einoopenai.WithExtraFields(map[string]any{
				"thinking": map[string]any{"type": "enabled"},
			}),
			einoopenai.WithReasoningEffort(einoopenai.ReasoningEffortLevelHigh),
			einoopenai.WithMaxCompletionTokens(4096),
		)
	}
	return options
}
