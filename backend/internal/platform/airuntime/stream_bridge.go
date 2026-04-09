package airuntime

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	nativeWebSearchCallID = "native_web_search"
	nativeWebSearchStepID = "native_web_search"
)

type streamBridge struct {
	onChunk func(StreamEvent) error
	reply   ReplyResponse
	runID   string
	seq     int

	nativeSearchState nativeSearchEventState
}

type nativeSearchEventState struct {
	started     bool
	resultCount int
	error       string
	lastResult  string
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
	b.reply.Sources = dedupeSources(append(b.reply.Sources, items...))
}

func (b *streamBridge) addSearchResults(items []Source) {
	if len(items) == 0 {
		return
	}
	b.reply.Metadata.SearchResults = dedupeSources(append(b.reply.Metadata.SearchResults, items...))
}

func (b *streamBridge) setModeAndModel(mode Mode, model string) {
	b.reply.Mode = mode
	b.reply.Model = strings.TrimSpace(model)
}

func (b *streamBridge) syncNativeWebSearch(snapshot nativeSearchSnapshot, finalize bool) error {
	if b == nil {
		return nil
	}
	results := dedupeSources(snapshot.Results)
	errorMessage := strings.TrimSpace(snapshot.Error)
	shouldStart := len(results) > 0 || errorMessage != ""
	if !shouldStart && !finalize {
		return nil
	}

	if shouldStart && !b.nativeSearchState.started {
		b.nativeSearchState.started = true
		detail := "模型原生联网搜索中"
		if len(results) > 0 {
			detail = fmt.Sprintf("模型原生联网已命中 %d 条结果", len(results))
		}
		if errorMessage != "" && len(results) == 0 {
			detail = "模型原生联网返回错误"
		}
		if err := b.emitWorkflow(WorkflowStep{
			ID:     nativeWebSearchStepID,
			Title:  "网页搜索",
			Status: "running",
			Detail: detail,
		}); err != nil {
			return err
		}
	}

	resultPayload := ""
	if len(results) > 0 || errorMessage != "" {
		payload, err := marshalNativeWebSearchResult(results, errorMessage)
		if err != nil {
			return err
		}
		resultPayload = payload
	}
	status := "running"
	if finalize {
		if errorMessage != "" && len(results) == 0 {
			status = "error"
		} else {
			status = "success"
		}
	}
	needsEmit := b.nativeSearchState.resultCount != len(results) ||
		b.nativeSearchState.error != errorMessage ||
		(finalize && status == "success") ||
		(finalize && status == "error") ||
		(resultPayload != "" && resultPayload != b.nativeSearchState.lastResult)
	if shouldStart && needsEmit {
		if err := b.emitTool(ToolCallRecord{
			CallID: nativeWebSearchCallID,
			Name:   "web_search",
			Status: status,
			Result: resultPayload,
		}); err != nil {
			return err
		}
	}
	if shouldStart {
		detail := "模型原生联网搜索中"
		if len(results) > 0 {
			detail = fmt.Sprintf("已获取 %d 条网页结果", len(results))
		}
		if errorMessage != "" {
			if len(results) > 0 {
				detail = fmt.Sprintf("已获取 %d 条网页结果，搜索链路有提示", len(results))
			} else {
				detail = "搜索链路返回错误"
			}
		}
		workflowStatus := "running"
		if finalize {
			if errorMessage != "" && len(results) == 0 {
				workflowStatus = "error"
			} else {
				workflowStatus = "done"
			}
		}
		if err := b.emitWorkflow(WorkflowStep{
			ID:     nativeWebSearchStepID,
			Title:  "网页搜索",
			Status: workflowStatus,
			Detail: detail,
		}); err != nil {
			return err
		}
	}
	b.nativeSearchState.resultCount = len(results)
	b.nativeSearchState.error = errorMessage
	b.nativeSearchState.lastResult = resultPayload
	return nil
}

func marshalNativeWebSearchResult(results []Source, errorMessage string) (string, error) {
	payload := map[string]any{
		"results": results,
	}
	if strings.TrimSpace(errorMessage) != "" {
		payload["error_message"] = strings.TrimSpace(errorMessage)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func (b *streamBridge) finishPendingAgents(exclude ...string) {
	if b == nil {
		return
	}
	excluded := make(map[string]struct{}, len(exclude))
	for _, name := range exclude {
		name = strings.TrimSpace(name)
		if name != "" {
			excluded[name] = struct{}{}
		}
	}
	for _, item := range b.reply.Metadata.AgentTrace {
		if _, ok := excluded[item.Name]; ok {
			continue
		}
		if item.Status == "running" || item.Status == "start" || item.Status == "in_progress" {
			detail := item.Detail
			if strings.TrimSpace(detail) == "" || detail == "执行中" || detail == "生成中" {
				detail = "执行完成"
			}
			_ = b.emitAgent(item.Name, "done", detail)
		}
	}
}
