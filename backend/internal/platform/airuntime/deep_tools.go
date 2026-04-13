package airuntime

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	einoadk "github.com/cloudwego/eino/adk"
	componenttool "github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/compose"

	airtool "github.com/chengjiang/aicook/backend/internal/platform/airuntime/tool"
)

func (r *Runtime) buildDeepTools() ([]componenttool.BaseTool, error) {
	tools := make([]componenttool.BaseTool, 0, 6)

	webTool, err := airtool.NewWebSearchTool(func(ctx context.Context, query string) (*airtool.SearchResult, error) {
		req, err := replyRequestFromContext(ctx)
		if err != nil {
			return nil, err
		}
		bridge, _ := streamBridgeFromContext(ctx)
		output, err := r.runWebSearchGraph(ctx, req, query, bridge)
		if err != nil {
			return nil, err
		}
		if output == nil {
			return &airtool.SearchResult{Query: query}, nil
		}
		return &airtool.SearchResult{
			Query:          query,
			Status:         output.Status,
			Summary:        output.Summary,
			Results:        toToolSources(fromGraphSources(output.Results)),
			ErrorMessage:   output.ErrorMessage,
			NeedWebEnabled: output.NeedWebEnabled,
		}, nil
	})
	if err != nil {
		return nil, err
	}
	tools = append(tools, webTool)

	if r.memoryWriter != nil {
		memTool, err := airtool.NewSaveHouseholdMemoryTool(func(ctx context.Context, scope, content string) error {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return err
			}
			return r.memoryWriter.SaveHouseholdMemory(ctx, req.HouseholdID, req.UserID, scope, content, "adk_tool")
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, memTool)
	}

	if r.knowledgeLookup != nil {
		knowledgeTool, err := airtool.NewKnowledgeLookupTool(func(ctx context.Context, query string, limit int) ([]airtool.Source, error) {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			results, err := r.knowledgeLookup.LookupKnowledgeSources(ctx, req.HouseholdID, query, limit)
			if err != nil {
				return nil, err
			}
			return toToolSources(results), nil
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, knowledgeTool)
	}

	if r.knowledgeIngestManager != nil {
		ingestTool, err := airtool.NewKnowledgeIngestManageTool(func(ctx context.Context, action, hint string) (*airtool.KnowledgeIngestManageResult, error) {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			sessionID, _ := strconv.ParseInt(strings.TrimSpace(req.ConversationID), 10, 64)
			result, err := r.knowledgeIngestManager.ManageKnowledgeIngest(ctx, req.HouseholdID, req.UserID, sessionID, action, hint)
			if err != nil {
				return nil, err
			}
			if result == nil {
				return &airtool.KnowledgeIngestManageResult{Action: action}, nil
			}
			return &airtool.KnowledgeIngestManageResult{
				Action:          result.Action,
				DocumentID:      result.DocumentID,
				MediaAssetID:    result.MediaAssetID,
				Title:           result.Title,
				Status:          result.Status,
				ProcessingStage: result.ProcessingStage,
				StageLabel:      result.StageLabel,
				Retryable:       result.Retryable,
				Partial:         result.Partial,
				Settled:         result.Settled,
				Summary:         result.Summary,
				FailureReason:   result.FailureReason,
				Message:         result.Message,
				Watch: func() *airtool.KnowledgeIngestWatch {
					if result.Watch == nil || strings.TrimSpace(result.Watch.AssetID) == "" {
						return nil
					}
					return &airtool.KnowledgeIngestWatch{
						AssetID: strings.TrimSpace(result.Watch.AssetID),
						Name:    strings.TrimSpace(result.Watch.Name),
					}
				}(),
			}, nil
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, ingestTool)
	}

	if r.recipeLookup != nil {
		recipeTool, err := airtool.NewRecipeQueryTool(func(ctx context.Context, query string, limit int) ([]airtool.RecipeCard, error) {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			results, err := r.recipeLookup.SearchRecipesForAI(ctx, req.HouseholdID, query, limit)
			if err != nil {
				return nil, err
			}
			return toToolRecipeCards(results), nil
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, recipeTool)

		recommendTool, err := airtool.NewRecipeRecommendTool(func(ctx context.Context, query string, limit int) ([]airtool.RecipeCard, error) {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			results, err := r.recipeLookup.SearchRecipesForAI(ctx, req.HouseholdID, query, limit)
			if err != nil {
				return nil, err
			}
			return toToolRecipeCards(results), nil
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, recommendTool)
	}

	textRecipeTool, err := airtool.NewRecipeGenerateTool(
		func(ctx context.Context, query string, limit int) ([]airtool.RecipeCard, error) {
			if r.recipeLookup == nil {
				return nil, nil
			}
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			results, err := r.recipeLookup.SearchRecipesForAI(ctx, req.HouseholdID, query, limit)
			if err != nil {
				return nil, err
			}
			return toToolRecipeCards(results), nil
		},
		func(ctx context.Context, query string, preferences airtool.TextRecipePreferences, coverImageURL string) (*airtool.TextRecipeResult, error) {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			bridge, _ := streamBridgeFromContext(ctx)
			output, err := r.runTextRecipeGraph(ctx, req, query, TextRecipePreferences{
				Flavor:      preferences.Flavor,
				Duration:    preferences.Duration,
				Difficulty:  preferences.Difficulty,
				Style:       preferences.Style,
				Constraints: append([]string(nil), preferences.Constraints...),
			}, coverImageURL, bridge)
			if err != nil {
				return nil, err
			}
			if output == nil {
				return &airtool.TextRecipeResult{
					Status:  "empty",
					Summary: "暂时没有生成结果，请稍后再试。",
				}, nil
			}
			return &airtool.TextRecipeResult{
				Status:  output.Status,
				Summary: output.Summary,
				Card:    toToolRecipeCard(output.Card),
				Sources: toToolSources(output.Sources),
			}, nil
		},
		func(ctx context.Context, query string, preferences airtool.TextRecipePreferences) (*airtool.RecipePreferencePlan, error) {
			return r.generateRecipePreferencePlan(ctx, query, preferences)
		},
	)
	if err != nil {
		return nil, err
	}
	tools = append(tools, textRecipeTool)

	if r.imageRecipeCreator != nil {
		imageTool, err := airtool.NewImageRecipeCreateTool(func(ctx context.Context, titleHint string) (*airtool.RecipeCard, error) {
			req, err := replyRequestFromContext(ctx)
			if err != nil {
				return nil, err
			}
			if !req.ImageRecipeEnabled || !hasImageAttachments(req.Attachments) {
				return nil, nil
			}
			bridge, _ := streamBridgeFromContext(ctx)
			card, err := r.runImageRecipeGraph(ctx, req, titleHint, bridge)
			if err != nil {
				return nil, err
			}
			return toToolRecipeCard(card), nil
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, imageTool)
	}

	return tools, nil
}

func (r *Runtime) filterDeepTools(ctx context.Context, tools []componenttool.BaseTool, allowed ...string) []componenttool.BaseTool {
	if len(allowed) == 0 {
		return nil
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, name := range allowed {
		allowedSet[name] = struct{}{}
	}
	filtered := make([]componenttool.BaseTool, 0, len(allowed))
	for _, item := range tools {
		if item == nil {
			continue
		}
		info, err := item.Info(ctx)
		if err != nil || info == nil {
			continue
		}
		if _, ok := allowedSet[info.Name]; ok {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func (r *Runtime) deepToolsConfig(tools []componenttool.BaseTool) einoadk.ToolsConfig {
	return einoadk.ToolsConfig{
		ToolsNodeConfig: compose.ToolsNodeConfig{
			Tools:               tools,
			ExecuteSequentially: true,
			ToolCallMiddlewares: []compose.ToolMiddleware{r.newToolEventMiddleware()},
		},
	}
}

func (r *Runtime) newToolEventMiddleware() compose.ToolMiddleware {
	return compose.ToolMiddleware{
		Invokable: func(next compose.InvokableToolEndpoint) compose.InvokableToolEndpoint {
			return func(ctx context.Context, input *compose.ToolInput) (*compose.ToolOutput, error) {
				bridge, _ := streamBridgeFromContext(ctx)
				record := ToolCallRecord{
					CallID:    input.CallID,
					Name:      input.Name,
					Status:    "start",
					Arguments: input.Arguments,
				}
				if bridge != nil {
					_ = bridge.emitTool(record)
				}

				output, err := next(ctx, input)
				if bridge == nil {
					return output, err
				}

				record.Status = "success"
				if err != nil {
					record.Status = "error"
					record.Result = err.Error()
					if info, ok := compose.ExtractInterruptInfo(err); ok && info != nil {
						record.Status = "interrupted"
						record.Result = "waiting for approval"
					}
				} else if output != nil {
					record.Result = strings.TrimSpace(output.Result)
					r.applyToolResult(bridge, input.Name, output.Result)
				}
				_ = bridge.emitTool(record)
				return output, err
			}
		},
	}
}

func (r *Runtime) applyToolResult(bridge *streamBridge, name, result string) {
	switch name {
	case "web_search", "knowledge_lookup":
		var payload airtool.SearchResult
		if err := json.Unmarshal([]byte(result), &payload); err == nil {
			bridge.addSources(fromToolSources(payload.Results))
			if name == "web_search" {
				bridge.addSearchResults(fromToolSources(payload.Results))
				if strings.TrimSpace(payload.ErrorMessage) != "" {
					bridge.reply.Metadata.SearchError = strings.TrimSpace(payload.ErrorMessage)
				}
				if payload.NeedWebEnabled && strings.TrimSpace(payload.Summary) != "" && strings.TrimSpace(bridge.reply.Content) == "" {
					bridge.reply.Content = strings.TrimSpace(payload.Summary)
				}
			}
		}
		if name == "knowledge_lookup" {
			bridge.reply.Metadata.Intent = string(IntentKnowledge)
		} else {
			bridge.reply.Metadata.Intent = string(IntentToolChat)
		}
	case "recipe_query":
		bridge.reply.Metadata.Intent = string(IntentRecipeQuery)
	case "image_recipe_create":
		bridge.reply.Metadata.Intent = string(IntentImageRecipe)
		var payload airtool.ImageRecipeResult
		if err := json.Unmarshal([]byte(result), &payload); err == nil && payload.Card != nil {
			_ = bridge.emitRecipeCard(fromToolRecipeCard(payload.Card))
		}
	case "recipe_recommend":
		bridge.reply.Metadata.Intent = string(IntentRecipeRecommend)
		var payload airtool.RecommendResult
		if err := json.Unmarshal([]byte(result), &payload); err == nil && payload.Card != nil {
			_ = bridge.emitRecipeCard(fromToolRecipeCard(payload.Card))
		}
	case "recipe_generate":
		bridge.reply.Metadata.Intent = string(IntentRecipeCreate)
		var payload airtool.TextRecipeResult
		if err := json.Unmarshal([]byte(result), &payload); err == nil {
			bridge.addSources(fromToolSources(payload.Sources))
			bridge.addSearchResults(filterSearchResultSources(fromToolSources(payload.Sources)))
			if payload.Card != nil {
				_ = bridge.emitRecipeCard(fromToolRecipeCard(payload.Card))
			}
			if strings.TrimSpace(payload.Summary) != "" && strings.TrimSpace(bridge.reply.Content) == "" {
				bridge.reply.Content = strings.TrimSpace(payload.Summary)
			}
		}
	case "knowledge_ingest_manage":
		bridge.reply.Metadata.Intent = string(IntentKnowledge)
		var payload airtool.KnowledgeIngestManageResult
		if err := json.Unmarshal([]byte(result), &payload); err == nil {
			if payload.Watch != nil && strings.TrimSpace(payload.Watch.AssetID) != "" {
				bridge.addKnowledgeIngestWatch([]KnowledgeIngestWatch{{
					AssetID: strings.TrimSpace(payload.Watch.AssetID),
					Name:    strings.TrimSpace(payload.Watch.Name),
				}})
			}
			if strings.TrimSpace(payload.Message) != "" && strings.TrimSpace(bridge.reply.Content) == "" {
				bridge.reply.Content = strings.TrimSpace(payload.Message)
			}
		}
	}
}

func toToolSources(items []Source) []airtool.Source {
	results := make([]airtool.Source, 0, len(items))
	for _, item := range items {
		results = append(results, airtool.Source{
			Title:       item.Title,
			DocumentID:  item.DocumentID,
			Snippet:     item.Snippet,
			SourceKind:  item.SourceKind,
			SiteName:    item.SiteName,
			PublishTime: item.PublishTime,
			LogoURL:     item.LogoURL,
		})
	}
	return results
}

func fromToolSources(items []airtool.Source) []Source {
	results := make([]Source, 0, len(items))
	for _, item := range items {
		results = append(results, Source{
			Title:       item.Title,
			DocumentID:  item.DocumentID,
			Snippet:     item.Snippet,
			SourceKind:  item.SourceKind,
			SiteName:    item.SiteName,
			PublishTime: item.PublishTime,
			LogoURL:     item.LogoURL,
		})
	}
	return results
}

func toToolRecipeCards(items []RecipeCard) []airtool.RecipeCard {
	results := make([]airtool.RecipeCard, 0, len(items))
	for _, item := range items {
		results = append(results, *toToolRecipeCard(&item))
	}
	return results
}

func toToolRecipeCard(item *RecipeCard) *airtool.RecipeCard {
	if item == nil {
		return nil
	}
	return &airtool.RecipeCard{
		RecipeID:      item.RecipeID,
		Title:         item.Title,
		Summary:       item.Summary,
		CoverImageURL: item.CoverImageURL,
		Ingredients:   append([]string(nil), item.Ingredients...),
		Time:          item.Time,
		Difficulty:    item.Difficulty,
		Status:        item.Status,
		Source:        item.Source,
		IsRecipe:      item.IsRecipe,
		RejectReason:  item.RejectReason,
		Draft:         toToolTextRecipeDraft(item.Draft),
	}
}

func fromToolRecipeCard(item *airtool.RecipeCard) *RecipeCard {
	if item == nil {
		return nil
	}
	return &RecipeCard{
		RecipeID:      item.RecipeID,
		Title:         item.Title,
		Summary:       item.Summary,
		CoverImageURL: item.CoverImageURL,
		Ingredients:   append([]string(nil), item.Ingredients...),
		Time:          item.Time,
		Difficulty:    item.Difficulty,
		Status:        item.Status,
		Source:        item.Source,
		IsRecipe:      item.IsRecipe,
		RejectReason:  item.RejectReason,
		Draft:         fromToolTextRecipeDraft(item.Draft),
	}
}

func toToolTextRecipeDraft(item *TextRecipeDraft) *airtool.TextRecipeDraft {
	if item == nil {
		return nil
	}
	ingredients := make([]airtool.DraftIngredient, 0, len(item.Ingredients))
	for _, ingredient := range item.Ingredients {
		ingredients = append(ingredients, airtool.DraftIngredient{
			GroupName:   ingredient.GroupName,
			Name:        ingredient.Name,
			AmountText:  ingredient.AmountText,
			Preparation: ingredient.Preparation,
		})
	}
	steps := make([]airtool.DraftStep, 0, len(item.Steps))
	for _, step := range item.Steps {
		steps = append(steps, airtool.DraftStep{
			Title:          step.Title,
			Description:    step.Description,
			StepType:       step.StepType,
			NeedTimer:      step.NeedTimer,
			TimerSeconds:   step.TimerSeconds,
			TimerAnimation: step.TimerAnimation,
			EndCondition:   step.EndCondition,
		})
	}
	return &airtool.TextRecipeDraft{
		Title:         item.Title,
		Summary:       item.Summary,
		Category:      item.Category,
		CoverImageURL: item.CoverImageURL,
		TotalMinutes:  item.TotalMinutes,
		Difficulty:    item.Difficulty,
		Tools:         append([]string(nil), item.Tools...),
		ScenarioTags:  append([]string(nil), item.ScenarioTags...),
		FlavorTags:    append([]string(nil), item.FlavorTags...),
		Ingredients:   ingredients,
		Steps:         steps,
	}
}

func fromToolTextRecipeDraft(item *airtool.TextRecipeDraft) *TextRecipeDraft {
	if item == nil {
		return nil
	}
	ingredients := make([]DraftIngredient, 0, len(item.Ingredients))
	for _, ingredient := range item.Ingredients {
		ingredients = append(ingredients, DraftIngredient{
			GroupName:   ingredient.GroupName,
			Name:        ingredient.Name,
			AmountText:  ingredient.AmountText,
			Preparation: ingredient.Preparation,
		})
	}
	steps := make([]DraftStep, 0, len(item.Steps))
	for _, step := range item.Steps {
		steps = append(steps, DraftStep{
			Title:          step.Title,
			Description:    step.Description,
			StepType:       step.StepType,
			NeedTimer:      step.NeedTimer,
			TimerSeconds:   step.TimerSeconds,
			TimerAnimation: step.TimerAnimation,
			EndCondition:   step.EndCondition,
		})
	}
	return &TextRecipeDraft{
		Title:         item.Title,
		Summary:       item.Summary,
		Category:      item.Category,
		CoverImageURL: item.CoverImageURL,
		TotalMinutes:  item.TotalMinutes,
		Difficulty:    item.Difficulty,
		Tools:         append([]string(nil), item.Tools...),
		ScenarioTags:  append([]string(nil), item.ScenarioTags...),
		FlavorTags:    append([]string(nil), item.FlavorTags...),
		Ingredients:   ingredients,
		Steps:         steps,
	}
}

func fromToolApproval(info *airtool.ApprovalInterrupt, interruptID string) *PendingApproval {
	if info == nil {
		return nil
	}
	options := make([]ApprovalOption, 0, len(info.Options))
	for _, option := range info.Options {
		options = append(options, ApprovalOption{
			ID:            option.ID,
			Title:         option.Title,
			Summary:       option.Summary,
			RecipeCard:    fromToolRecipeCard(option.RecipeCard),
			PreferenceKey: option.PreferenceKey,
			Value:         option.Value,
		})
	}
	return &PendingApproval{
		ID:                interruptID,
		Kind:              info.Kind,
		Prompt:            info.Prompt,
		Status:            "pending",
		SelectionMode:     info.SelectionMode,
		StepIndex:         info.StepIndex,
		StepTotal:         info.StepTotal,
		AllowSkip:         info.AllowSkip,
		SelectedOptionIDs: append([]string(nil), info.SelectedOptionIDs...),
		Options:           options,
	}
}
