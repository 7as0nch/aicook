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

	airtool "github.com/chengjiang/aicook/backend/internal/platform/airuntime/tool"
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

type streamBridge struct {
	onChunk func(StreamEvent) error
	reply   ReplyResponse
	runID   string
	seq     int
}

func newStreamBridge(req ReplyRequest, onChunk func(StreamEvent) error) *streamBridge {
	reply := ReplyResponse{
		Mode:       ModeADK,
		Sources:    append([]Source(nil), req.Sources...),
		IsFallback: false,
		Metadata: ReplyMetadata{
			Intent: string(IntentChat),
		},
	}
	return &streamBridge{
		onChunk: onChunk,
		reply:   reply,
		runID:   fmt.Sprintf("run_%d", time.Now().UnixNano()),
	}
}

func (b *streamBridge) nextSequence() int {
	b.seq++
	return b.seq
}

func (b *streamBridge) emit(kind StreamEventKind, content, partType, callID string, metadata map[string]any) error {
	event := StreamEvent{
		Kind:      kind,
		RunID:     b.runID,
		MessageID: "assistant",
		Sequence:  b.nextSequence(),
		PartType:  partType,
		CallID:    callID,
		Content:   content,
		Metadata:  metadata,
	}
	b.reply.Metadata.Timeline = append(b.reply.Metadata.Timeline, TimelineEvent{
		Kind:     event.Kind,
		RunID:    event.RunID,
		Sequence: event.Sequence,
		PartType: event.PartType,
		CallID:   event.CallID,
		Content:  event.Content,
		Metadata: event.Metadata,
	})
	if b.onChunk != nil {
		if err := b.onChunk(event); err != nil {
			return err
		}
	}
	return nil
}

func (b *streamBridge) emitAnswer(chunk string) error {
	if chunk == "" {
		return nil
	}
	b.reply.Content += chunk
	return b.emit(StreamEventAnswer, chunk, "delta", "", nil)
}

func (b *streamBridge) emitReasoning(chunk string) error {
	if chunk == "" {
		return nil
	}
	b.reply.ReasoningContent += chunk
	b.reply.Metadata.ReasoningContent = b.reply.ReasoningContent
	return b.emit(StreamEventReasoning, chunk, "delta", "", nil)
}

func (b *streamBridge) emitAgent(name, status, detail string) error {
	index := -1
	for idx, item := range b.reply.Metadata.AgentTrace {
		if item.Name == name {
			index = idx
			break
		}
	}
	trace := AgentTrace{ID: name, Name: name, Status: status, Detail: detail}
	if index >= 0 {
		b.reply.Metadata.AgentTrace[index] = trace
	} else {
		b.reply.Metadata.AgentTrace = append(b.reply.Metadata.AgentTrace, trace)
	}
	return b.emit(StreamEventAgentCall, detail, status, name, map[string]any{
		"id":     trace.ID,
		"name":   trace.Name,
		"status": trace.Status,
		"detail": trace.Detail,
	})
}

func (b *streamBridge) emitWorkflow(step WorkflowStep) error {
	index := -1
	for idx, item := range b.reply.Metadata.Workflow {
		if item.ID == step.ID {
			index = idx
			break
		}
	}
	if index >= 0 {
		b.reply.Metadata.Workflow[index] = step
	} else {
		b.reply.Metadata.Workflow = append(b.reply.Metadata.Workflow, step)
	}
	return b.emit(StreamEventStatus, step.Title, step.Status, step.ID, map[string]any{
		"step_id": step.ID,
		"title":   step.Title,
		"status":  step.Status,
		"detail":  step.Detail,
	})
}

func (b *streamBridge) emitTool(record ToolCallRecord) error {
	index := -1
	for idx, item := range b.reply.Metadata.ToolCalls {
		if item.CallID != "" && item.CallID == record.CallID {
			index = idx
			break
		}
		if item.Name == record.Name && item.Arguments == record.Arguments {
			index = idx
			break
		}
	}
	if index >= 0 {
		b.reply.Metadata.ToolCalls[index] = record
	} else {
		b.reply.Metadata.ToolCalls = append(b.reply.Metadata.ToolCalls, record)
	}
	return b.emit(StreamEventToolCall, record.Name, record.Status, record.CallID, map[string]any{
		"call_id":   record.CallID,
		"name":      record.Name,
		"status":    record.Status,
		"arguments": record.Arguments,
		"result":    record.Result,
	})
}

func (b *streamBridge) emitRecipeCard(card *RecipeCard) error {
	if card == nil {
		return nil
	}
	b.reply.Metadata.RecipeCard = card
	return b.emit(StreamEventRecipeCard, card.Summary, "snapshot", "recipe_card", map[string]any{
		"card": card,
	})
}

func (b *streamBridge) emitApproval(approval *PendingApproval) error {
	if approval == nil {
		return nil
	}
	b.reply.Metadata.PendingApproval = approval
	return b.emit(StreamEventApproval, approval.Prompt, approval.Status, approval.ID, map[string]any{
		"approval": approval,
	})
}

func (b *streamBridge) addSources(items []Source) {
	if len(items) == 0 {
		return
	}
	b.reply.Sources = append(b.reply.Sources, items...)
}

func (b *streamBridge) setModeAndModel(mode Mode, model string) {
	b.reply.Mode = mode
	b.reply.Model = strings.TrimSpace(model)
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
		Instruction:   buildMultimodalSubAgentInstruction(),
		Model:         routingModel,
		ToolsConfig:   r.deepToolsConfig(filterDeepTools(ctx, tools, "image_recipe_create")),
		MaxIterations: 6,
	})
	if err != nil {
		r.adkErr = err
		return
	}

	recommendSubAgent, err := einoadk.NewChatModelAgent(ctx, &einoadk.ChatModelAgentConfig{
		Name:          adkRecommendAgentName,
		Description:   "负责处理我要做某道菜时的候选推荐、approval 等待与恢复后确认。",
		Instruction:   buildRecommendSubAgentInstruction(),
		Model:         routingModel,
		ToolsConfig:   r.deepToolsConfig(filterDeepTools(ctx, tools, "recipe_generate", "recipe_recommend", "recipe_query")),
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
		Instruction:           buildDeepInstruction(),
		ToolsConfig:           r.deepToolsConfig(filterDeepTools(ctx, tools, "web_search", "knowledge_lookup", "recipe_query")),
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
	r.deepCheckpointStore = newMemoryCheckpointStore()
	r.deepRunner = einoadk.NewRunner(ctx, einoadk.RunnerConfig{
		Agent:           rootAgent,
		EnableStreaming: true,
		CheckPointStore: r.deepCheckpointStore,
	})
}

func buildDeepInstruction() string {
	return strings.TrimSpace(fmt.Sprintf(`
你是 AICook 的智能烹饪助手，请始终使用中文回答。
你当前运行在 deep planner 中，请优先直接完成用户问题；只有在必要时再调用工具。

规则：
1. 只有用户明确开启联网时，才调用 web_search。
2. 需要查询家庭知识、已有菜谱或推荐候选时，优先调用对应工具。
3. 用户上传图片并希望识别成菜谱时，优先使用 task 调用 %s 子 agent，由它处理多模态与 graph 工作流。
4. 用户表达“我要做某道菜”“帮我推荐更合适的做法/口味”“给我生成某道菜谱”时，优先使用 task 调用 %s 子 agent，由它处理候选推荐、文本菜谱 graph、approval 恢复与最终确认。
5. 当工具已经返回足够信息后，直接整理成简洁、可执行的中文结果，不要暴露内部工具名或 JSON。
`, adkMultimodalAgentName, adkRecommendAgentName))
}

func buildMultimodalSubAgentInstruction() string {
	return strings.TrimSpace(`
你是 AICook 的多模态菜谱子 agent。
当用户上传图片并希望整理成菜谱时，只调用 image_recipe_create。
该工具内部已经接了 graph 工作流，请根据返回的工作流状态与菜谱卡片，继续给出简短确认说明。
`)
}

func buildRecommendSubAgentInstruction() string {
	return strings.TrimSpace(`
你是 AICook 的推荐子 agent。
当用户说“我要做某道菜”“给我生成某道菜谱”或表达口味偏好时，优先调用 recipe_generate。
如果用户只是明确要查现有库里的菜谱，再调用 recipe_query 或 recipe_recommend。
当 recipe_generate 进入 approval 恢复后，请根据用户选择继续推进，不要直接跳过现有菜谱确认。
`)
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
					Approved: req.ApprovalResponse.Confirmed,
					OptionID: req.ApprovalResponse.OptionID,
				},
			},
		})
	} else {
		iter = r.deepRunner.Run(runCtx, buildConversationMessages(req), einoadk.WithCheckPointID(checkpointID))
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
	_ = bridge.emitAgent(adkRootAgentName, "done", "deep planner 完成")

	bridge.reply.Content = strings.TrimSpace(bridge.reply.Content)
	bridge.reply.ReasoningContent = strings.TrimSpace(bridge.reply.ReasoningContent)
	bridge.reply.Metadata.ReasoningContent = bridge.reply.ReasoningContent
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

func consumeMessageOutput(_ context.Context, bridge *streamBridge, event *einoadk.AgentEvent) error {
	if event.Output == nil || event.Output.MessageOutput == nil {
		return nil
	}
	output := event.Output.MessageOutput
	if output.IsStreaming && output.MessageStream != nil {
		defer output.MessageStream.Close()
		for {
			chunk, err := output.MessageStream.Recv()
			if err != nil {
				if err == io.EOF {
					return nil
				}
				return err
			}
			if chunk == nil || output.Role != schema.Assistant {
				continue
			}
			if err := bridge.emitReasoning(chunk.ReasoningContent); err != nil {
				return err
			}
			if err := bridge.emitAnswer(chunk.Content); err != nil {
				return err
			}
		}
	}
	if output.Message == nil || output.Role != schema.Assistant {
		return nil
	}
	if err := bridge.emitReasoning(output.Message.ReasoningContent); err != nil {
		return err
	}
	return bridge.emitAnswer(output.Message.Content)
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
