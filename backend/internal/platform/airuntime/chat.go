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

func (r *Runtime) buildCallOptions(req ReplyRequest) []einomodel.Option {
	return r.buildCallOptionsWithTooling(req, nil)
}

func (r *Runtime) buildCallOptionsWithTooling(req ReplyRequest, toolInfos []*schema.ToolInfo) []einomodel.Option {
	options := []einomodel.Option{
		einomodel.WithTemperature(0.2),
		einoopenai.WithResponseMessageModifier(reasoningResponseModifier),
		einoopenai.WithResponseChunkMessageModifier(reasoningChunkModifier),
	}
	extraFields := make(map[string]any)
	withTools := len(toolInfos) > 0
	// MiMo 在 tool calling 场景下开启 thinking 容易直接收尾，导致工具一调用就结束；
	// 这里保留前端“思考模式”开关用于普通回答，但进入工具模式时自动降级为关闭 thinking。
	reasoningEnabled := req.ReasoningEnabled && !withTools
	if reasoningEnabled {
		extraFields["thinking"] = map[string]any{"type": "enabled"}
		options = append(options,
			einoopenai.WithReasoningEffort(einoopenai.ReasoningEffortLevelHigh),
			einoopenai.WithMaxCompletionTokens(4096),
		)
	} else if r.supportsNativeWebSearch() {
		// 小米 MiMo 要求显式关闭 thinking，避免联网请求体不一致。
		extraFields["thinking"] = map[string]any{"type": "disabled"}
	}
	if len(extraFields) > 0 {
		options = append(options, einoopenai.WithExtraFields(extraFields))
	}
	return options
}

func (r *Runtime) buildCallOptionsFromContext(ctx context.Context) []einomodel.Option {
	req, err := replyRequestFromContext(ctx)
	if err != nil {
		return r.buildCallOptionsWithTooling(ReplyRequest{}, nil)
	}
	return r.buildCallOptionsWithTooling(req, nil)
}

func (r *Runtime) supportsNativeWebSearch() bool {
	if r == nil || r.provider == nil {
		return false
	}
	provider := strings.ToLower(strings.TrimSpace(r.provider.GetProvider()))
	baseURL := strings.ToLower(strings.TrimSpace(r.provider.GetBaseUrl()))
	if provider == "xiaomi" || provider == "mimo" {
		return true
	}
	return strings.Contains(baseURL, "xiaomimimo.com")
}

func nativeWebSearchToolPayload() map[string]any {
	return map[string]any{
		"type":         "web_search",
		"max_keyword":  3,
		"force_search": true,
		"limit":        3,
		"user_location": map[string]any{
			"type":    "approximate",
			"country": "China",
			"region":  "Hubei",
			"city":    "Wuhan",
		},
	}
}

func buildMiMoToolPayloads(toolInfos []*schema.ToolInfo, includeNativeWebSearch bool) ([]map[string]any, error) {
	results := make([]map[string]any, 0, len(toolInfos)+1)
	for _, info := range toolInfos {
		if info == nil {
			continue
		}
		paramsJSONSchema, err := info.ParamsOneOf.ToJSONSchema()
		if err != nil {
			return nil, fmt.Errorf("convert tool %s parameters failed: %w", info.Name, err)
		}
		results = append(results, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        info.Name,
				"description": info.Desc,
				"parameters":  paramsJSONSchema,
			},
		})
	}
	if includeNativeWebSearch {
		results = append(results, nativeWebSearchToolPayload())
	}
	return results, nil
}

func (r *Runtime) buildNativeWebSearchOptions(req ReplyRequest) []einomodel.Option {
	options := []einomodel.Option{
		einomodel.WithTemperature(0.2),
		einoopenai.WithResponseMessageModifier(reasoningResponseModifier),
		einoopenai.WithResponseChunkMessageModifier(reasoningChunkModifier),
	}
	extraFields := map[string]any{
		"thinking": map[string]any{"type": "disabled"},
		"tools":    []map[string]any{nativeWebSearchToolPayload()},
	}
	options = append(options,
		einoopenai.WithExtraFields(extraFields),
		einoopenai.WithMaxCompletionTokens(512),
	)
	return options
}
