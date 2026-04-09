package airuntime

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	einoadk "github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/adk/prebuilt/deep"
	"github.com/cloudwego/eino/schema"

	airinstruction "github.com/chengjiang/aicook/backend/internal/platform/airuntime/instruction"
	airtool "github.com/chengjiang/aicook/backend/internal/platform/airuntime/tool"
	aircheckpoint "github.com/chengjiang/aicook/backend/internal/platform/airuntime/checkpoint"
)

const (
	adkRootAgentName       = "aicook_deep_root"
	adkMultimodalAgentName = "aicook_multimodal_agent"
	adkRecommendAgentName  = "aicook_recommend_agent"
)

type adkContextKey string

const (
	replyRequestContextKey adkContextKey = "aicook.reply_request"
	streamBridgeContextKey adkContextKey = "aicook.stream_bridge"
)

// RefreshADKAfterRegistrations 在业务层完成 RegisterKnowledgeLookup 等依赖注入后调用，
// 使 deep agent 构建时能挂上全部工具（避免 New() 早于 Wire 注册导致工具缺失）。
func (r *Runtime) RefreshADKAfterRegistrations() {
	r.initADK()
}

func (r *Runtime) initADK() {
	ctx := context.Background()
	tools, err := r.buildDeepTools()
	if err != nil {
		r.adkErr = err
		return
	}
	routingModel := newRoutingChatModel(r)

	multimodalSubAgent, err := einoadk.NewChatModelAgent(ctx, &einoadk.ChatModelAgentConfig{
		Name:          adkMultimodalAgentName,
		Description:   "负责处理上传图片后的菜谱识别与 graph 草稿流程。",
		Instruction:   airinstruction.BuildMultimodalSubAgentInstruction(),
		Model:         routingModel,
		ToolsConfig:   r.deepToolsConfig(r.filterDeepTools(ctx, tools, "image_recipe_create")),
		MaxIterations: 6,
	})
	if err != nil {
		r.adkErr = err
		return
	}

	recommendSubAgent, err := einoadk.NewChatModelAgent(ctx, &einoadk.ChatModelAgentConfig{
		Name:          adkRecommendAgentName,
		Description:   "负责处理我要做某道菜时的候选推荐、approval 等待与恢复后确认。",
		Instruction:   airinstruction.BuildRecommendSubAgentInstruction(),
		Model:         routingModel,
		ToolsConfig:   r.deepToolsConfig(r.filterDeepTools(ctx, tools, "recipe_generate", "recipe_recommend", "recipe_query")),
		MaxIterations: 6,
	})
	if err != nil {
		r.adkErr = err
		return
	}

	rootAgent, err := deep.New(ctx, &deep.Config{
		Name:                  adkRootAgentName,
		Description:           "AICook 官方 deep planner，处理聊天、工具增强、多模态与可恢复的候选确认。",
		ChatModel:             routingModel,
		Instruction:           airinstruction.BuildDeepInstruction(adkMultimodalAgentName, adkRecommendAgentName),
		ToolsConfig:           r.deepToolsConfig(r.filterDeepTools(ctx, tools, "web_search", "knowledge_lookup", "save_household_memory", "recipe_query")),
		SubAgents:             []einoadk.Agent{multimodalSubAgent, recommendSubAgent},
		MaxIteration:          12,
		WithoutWriteTodos:     true,
		WithoutGeneralSubAgent: true,
	})
	if err != nil {
		r.adkErr = err
		return
	}

	r.deepRootAgent = rootAgent
	r.deepCheckpointStore = aircheckpoint.NewMemoryStore()
	r.deepRunner = einoadk.NewRunner(ctx, einoadk.RunnerConfig{
		Agent:           rootAgent,
		EnableStreaming: true,
		CheckPointStore: r.deepCheckpointStore,
	})
}

func withReplyRequest(ctx context.Context, req ReplyRequest) context.Context {
	return context.WithValue(ctx, replyRequestContextKey, req)
}

func replyRequestFromContext(ctx context.Context) (ReplyRequest, error) {
	req, ok := ctx.Value(replyRequestContextKey).(ReplyRequest)
	if !ok {
		return ReplyRequest{}, fmt.Errorf("reply request missing from adk context")
	}
	return req, nil
}

func withStreamBridge(ctx context.Context, bridge *streamBridge) context.Context {
	return context.WithValue(ctx, streamBridgeContextKey, bridge)
}

func streamBridgeFromContext(ctx context.Context) (*streamBridge, error) {
	bridge, ok := ctx.Value(streamBridgeContextKey).(*streamBridge)
	if !ok || bridge == nil {
		return nil, fmt.Errorf("stream bridge missing from adk context")
	}
	return bridge, nil
}

func (r *Runtime) runWithADK(ctx context.Context, req ReplyRequest, onChunk func(StreamEvent) error) (*ReplyResponse, error) {
	if r.adkErr != nil {
		return nil, r.adkErr
	}
	if r.deepRunner == nil || r.deepRootAgent == nil {
		return nil, fmt.Errorf("deep runner is not configured")
	}

	bridge := newStreamBridge(req, onChunk)
	runCtx := withReplyRequest(ctx, req)
	runCtx = withStreamBridge(runCtx, bridge)
	runCtx = withCitationsCollector(runCtx)
	if err := bridge.emitAgent(adkRootAgentName, "running", "官方 deep planner 调度中"); err != nil {
		return nil, err
	}

	modelName := r.currentModelName(req)
	bridge.setModeAndModel(ModeADK, modelName)

	checkpointID := r.checkpointID(req)
	var (
		iter *einoadk.AsyncIterator[*einoadk.AgentEvent]
		err  error
	)
	if req.ApprovalResponse != nil {
		iter, err = r.deepRunner.ResumeWithParams(runCtx, checkpointID, &einoadk.ResumeParams{
			Targets: map[string]any{
				req.ApprovalResponse.ApprovalID: &airtool.ApprovalResult{
					Approved:  req.ApprovalResponse.Confirmed,
					OptionID:  req.ApprovalResponse.OptionID,
					OptionIDs: append([]string(nil), req.ApprovalResponse.OptionIDs...),
				},
			},
		})
	} else {
		msgs, convErr := r.buildConversationMessages(runCtx, req)
		if convErr != nil {
			return nil, convErr
		}
		iter = r.deepRunner.Run(runCtx, msgs, einoadk.WithCheckPointID(checkpointID))
	}
	if err != nil {
		return nil, err
	}

	if err := r.consumeDeepEvents(runCtx, bridge, iter); err != nil {
		return nil, err
	}
	if bridge.reply.Metadata.PendingApproval == nil && r.deepCheckpointStore != nil {
		r.deepCheckpointStore.Delete(checkpointID)
	}
	bridge.finishPendingAgents(adkRootAgentName)
	_ = bridge.emitAgent(adkRootAgentName, "done", "deep planner 完成")

	bridge.reply.Content = strings.TrimSpace(bridge.reply.Content)
	bridge.reply.ReasoningContent = strings.TrimSpace(bridge.reply.ReasoningContent)
	bridge.reply.Metadata.ReasoningContent = bridge.reply.ReasoningContent
	bridge.reply.Metadata.SearchResults = dedupeSources(bridge.reply.Metadata.SearchResults)
	return &bridge.reply, nil
}

func (r *Runtime) consumeDeepEvents(ctx context.Context, bridge *streamBridge, iter *einoadk.AsyncIterator[*einoadk.AgentEvent]) error {
	for {
		event, ok := iter.Next()
		if !ok {
			return nil
		}
		if event == nil {
			continue
		}
		if event.Err != nil {
			return event.Err
		}
		if err := syncAgentTraceFromEvent(bridge, event); err != nil {
			return err
		}
		if event.Action != nil && event.Action.Interrupted != nil {
			approval := extractPendingApproval(event.Action.Interrupted)
			if approval != nil {
				bridge.reply.Metadata.Intent = string(IntentRecipeRecommend)
				if err := bridge.emitApproval(approval); err != nil {
					return err
				}
			}
		}
		if err := consumeMessageOutput(ctx, bridge, event); err != nil {
			return err
		}
	}
}

func consumeMessageOutput(ctx context.Context, bridge *streamBridge, event *einoadk.AgentEvent) error {
	if event.Output == nil || event.Output.MessageOutput == nil {
		return nil
	}
	output := event.Output.MessageOutput
	if output.IsStreaming && output.MessageStream != nil {
		defer output.MessageStream.Close()
		streamedAnswer := false
		for {
			chunk, err := output.MessageStream.Recv()
			if err != nil {
				if err == io.EOF {
					break
				}
				return err
			}
			if chunk == nil || output.Role != schema.Assistant {
				continue
			}
			if err := bridge.emitReasoning(chunk.ReasoningContent); err != nil {
				return err
			}
			if err := bridge.syncNativeWebSearch(nativeSearchSnapshotFromContext(ctx), false); err != nil {
				return err
			}
			if err := bridge.emitAnswer(chunk.Content); err != nil {
				return err
			}
			if strings.TrimSpace(chunk.Content) != "" {
				streamedAnswer = true
			}
		}
		if output.Message == nil || output.Role != schema.Assistant {
			return nil
		}
		if strings.TrimSpace(bridge.reply.ReasoningContent) == "" {
			if err := bridge.emitReasoning(output.Message.ReasoningContent); err != nil {
				return err
			}
		}
		nativeSearchResults := citationsFromContext(ctx)
		bridge.addSources(nativeSearchResults)
		bridge.addSearchResults(nativeSearchResults)
		if searchError := searchErrorFromContext(ctx); strings.TrimSpace(searchError) != "" {
			bridge.reply.Metadata.SearchError = strings.TrimSpace(searchError)
		}
		if err := bridge.syncNativeWebSearch(nativeSearchSnapshotFromContext(ctx), true); err != nil {
			return err
		}
		if !streamedAnswer && strings.TrimSpace(output.Message.Content) != "" {
			return bridge.emitAnswer(output.Message.Content)
		}
		return nil
	}
	if output.Message == nil || output.Role != schema.Assistant {
		return nil
	}
	if err := bridge.emitReasoning(output.Message.ReasoningContent); err != nil {
		return err
	}
	nativeSearchResults := citationsFromContext(ctx)
	bridge.addSources(nativeSearchResults)
	bridge.addSearchResults(nativeSearchResults)
	if searchError := searchErrorFromContext(ctx); strings.TrimSpace(searchError) != "" {
		bridge.reply.Metadata.SearchError = strings.TrimSpace(searchError)
	}
	if err := bridge.syncNativeWebSearch(nativeSearchSnapshotFromContext(ctx), true); err != nil {
		return err
	}
	return bridge.emitAnswer(output.Message.Content)
}

func syncAgentTraceFromEvent(bridge *streamBridge, event *einoadk.AgentEvent) error {
	if bridge == nil || event == nil {
		return nil
	}
	name := strings.TrimSpace(event.AgentName)
	if name == "" || name == adkRootAgentName {
		return nil
	}
	status := "running"
	detail := "执行中"
	if event.Output != nil && event.Output.MessageOutput != nil && event.Output.MessageOutput.IsStreaming {
		detail = "生成中"
	}
	if event.Action != nil {
		switch {
		case event.Action.Interrupted != nil:
			status = "done"
			detail = "等待用户确认"
		case event.Action.Exit:
			status = "done"
			detail = "执行完成"
		case event.Action.TransferToAgent != nil:
			status = "done"
			dest := strings.TrimSpace(event.Action.TransferToAgent.DestAgentName)
			if dest != "" {
				detail = "转交给 " + dest
			} else {
				detail = "已转交后续节点"
			}
		}
	}
	return bridge.emitAgent(name, status, detail)
}

func extractPendingApproval(info *einoadk.InterruptInfo) *PendingApproval {
	if info == nil {
		return nil
	}
	for _, item := range info.InterruptContexts {
		if item == nil || !item.IsRootCause {
			continue
		}
		switch value := item.Info.(type) {
		case *airtool.ApprovalInterrupt:
			return fromToolApproval(value, item.ID)
		case airtool.ApprovalInterrupt:
			return fromToolApproval(&value, item.ID)
		}
	}
	return nil
}

func (r *Runtime) checkpointID(req ReplyRequest) string {
	if strings.TrimSpace(req.ConversationID) != "" {
		return "aicook-ai-" + strings.TrimSpace(req.ConversationID)
	}
	return fmt.Sprintf("aicook-ai-temp-%d", time.Now().UnixNano())
}

func (r *Runtime) currentModelName(req ReplyRequest) string {
	if hasRichInput(req.Attachments) {
		if strings.TrimSpace(r.multimodalModelName) != "" {
			return r.multimodalModelName
		}
	}
	if strings.TrimSpace(r.textModelName) != "" {
		return r.textModelName
	}
	return r.multimodalModelName
}
