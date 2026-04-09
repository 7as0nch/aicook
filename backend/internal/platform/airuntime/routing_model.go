package airuntime

import (
	"context"
	"fmt"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type routingChatModel struct {
	runtime  *Runtime
	toolInfos []*schema.ToolInfo
}

func newRoutingChatModel(runtime *Runtime) *routingChatModel {
	return &routingChatModel{runtime: runtime}
}

func (m *routingChatModel) Generate(ctx context.Context, input []*schema.Message, opts ...einomodel.Option) (*schema.Message, error) {
	model, err := m.prepareModel(ctx, input)
	if err != nil {
		return nil, err
	}
	return model.Generate(ctx, input, append(m.callOptions(ctx), opts...)...)
}

func (m *routingChatModel) Stream(ctx context.Context, input []*schema.Message, opts ...einomodel.Option) (*schema.StreamReader[*schema.Message], error) {
	model, err := m.prepareModel(ctx, input)
	if err != nil {
		return nil, err
	}
	return model.Stream(ctx, input, append(m.callOptions(ctx), opts...)...)
}

func (m *routingChatModel) WithTools(tools []*schema.ToolInfo) (einomodel.ToolCallingChatModel, error) {
	return &routingChatModel{
		runtime:  m.runtime,
		toolInfos: append([]*schema.ToolInfo(nil), tools...),
	}, nil
}

func (m *routingChatModel) prepareModel(ctx context.Context, input []*schema.Message) (einomodel.BaseChatModel, error) {
	selected, _, err := m.runtime.selectChatModel(needsMultimodalModel(input))
	if err != nil {
		return nil, err
	}
	if len(m.toolInfos) == 0 {
		return selected, nil
	}
	toolModel, ok := any(selected).(einomodel.ToolCallingChatModel)
	if !ok {
		return nil, fmt.Errorf("selected model does not support tools")
	}
	return toolModel.WithTools(m.toolInfos)
}

func (m *routingChatModel) callOptions(ctx context.Context) []einomodel.Option {
	req, err := replyRequestFromContext(ctx)
	if err != nil {
		return m.runtime.buildCallOptionsWithTooling(ReplyRequest{}, m.toolInfos)
	}
	return m.runtime.buildCallOptionsWithTooling(req, m.toolInfos)
}

func needsMultimodalModel(messages []*schema.Message) bool {
	for _, msg := range messages {
		if msg == nil || len(msg.UserInputMultiContent) == 0 {
			continue
		}
		for _, part := range msg.UserInputMultiContent {
			switch part.Type {
			case schema.ChatMessagePartTypeImageURL,
				schema.ChatMessagePartTypeAudioURL,
				schema.ChatMessagePartTypeVideoURL:
				return true
			}
		}
	}
	return false
}
