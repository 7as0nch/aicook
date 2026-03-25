package service

import (
	"encoding/json"
	"strconv"
	"time"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	structpb "google.golang.org/protobuf/types/known/structpb"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"
)

func toProtoRecipe(model *data.Recipe) *v1.Recipe {
	if model == nil {
		return nil
	}
	return &v1.Recipe{
		Id:            model.ID,
		HouseholdId:   model.HouseholdID,
		OwnerUserId:   model.OwnerUserID,
		SourceHouseholdId: model.SourceHouseholdID,
		ForkedFromRecipeId: model.ForkedFromRecipeID,
		Title:         model.Title,
		Summary:       model.Summary,
		CoverImageUrl: model.CoverImageURL,
		Status:        model.Status,
		SourceType:    model.SourceType,
		Language:      model.Language,
		Category:      model.Category,
		TotalMinutes:  int32(model.TotalMinutes),
		Difficulty:    int32(model.Difficulty),
		ScenarioTags:  jsonArrayToStrings(model.ScenarioTags),
		FlavorTags:    jsonArrayToStrings(model.FlavorTags),
		Tools:         jsonArrayToStrings(model.Tools),
		Metadata:      jsonMapToStruct(model.MetadataJSON),
		CreatedAt:     toTimestamp(model.CreatedAt),
		UpdatedAt:     toTimestamp(model.UpdatedAt),
	}
}

func toProtoHousehold(model *data.Household) *v1.HouseholdSummary {
	if model == nil {
		return nil
	}
	return &v1.HouseholdSummary{
		Id:        model.ID,
		Name:      model.Name,
		ShareCode: model.ShareCode,
		Timezone:  model.Timezone,
		CreatedAt: toTimestamp(model.CreatedAt),
		UpdatedAt: toTimestamp(model.UpdatedAt),
	}
}

func toProtoHouseholds(items []*data.Household) []*v1.HouseholdSummary {
	out := make([]*v1.HouseholdSummary, 0, len(items))
	for _, item := range items {
		out = append(out, toProtoHousehold(item))
	}
	return out
}

func toProtoUser(model *data.User) *v1.UserProfile {
	if model == nil {
		return nil
	}
	return &v1.UserProfile{
		Id:          model.ID,
		HouseholdId: model.HouseholdID,
		Username:    model.Username,
		Phone:       model.Phone,
		DisplayName: model.DisplayName,
		Email:       model.Email,
		Status:      model.Status,
		CreatedAt:   toTimestamp(model.CreatedAt),
		UpdatedAt:   toTimestamp(model.UpdatedAt),
	}
}

func toProtoKitchenTag(model *data.KitchenTag) *v1.KitchenTag {
	if model == nil {
		return nil
	}
	return &v1.KitchenTag{
		Id:          model.ID,
		HouseholdId: model.HouseholdID,
		Name:        model.Name,
		Icon:        model.Icon,
		Color:       model.Color,
		Type:        uint32(model.Type),
		CreatedAt:   toTimestamp(model.CreatedAt),
		UpdatedAt:   toTimestamp(model.UpdatedAt),
	}
}

func toProtoRecipeIngredient(model *data.RecipeIngredient) *v1.RecipeIngredient {
	if model == nil {
		return nil
	}
	return &v1.RecipeIngredient{
		Id:          model.ID,
		RecipeId:    model.RecipeID,
		SortOrder:   int32(model.SortOrder),
		GroupName:   model.GroupName,
		Name:        model.Name,
		AmountText:  model.AmountText,
		Preparation: model.Preparation,
		Remark:      model.Remark,
	}
}

func toProtoRecipeStep(model *data.RecipeStep) *v1.RecipeStep {
	if model == nil {
		return nil
	}
	return &v1.RecipeStep{
		Id:             model.ID,
		RecipeId:       model.RecipeID,
		StepNo:         int32(model.StepNo),
		Title:          model.Title,
		Description:    model.Description,
		StepType:       model.StepType,
		NeedTimer:      model.NeedTimer,
		TimerSeconds:   int32(model.TimerSeconds),
		TimerAnimation: model.TimerAnimation,
		HeatLevel:      model.HeatLevel,
		EndCondition:   model.EndCondition,
		SafetyTips:     model.SafetyTips,
		AiHint:         model.AIHint,
		MediaUrl:       model.MediaURL,
	}
}

func toProtoRecipeDetail(detail *data.RecipeDetail) *v1.RecipeDetail {
	if detail == nil {
		return nil
	}
	ingredients := make([]*v1.RecipeIngredient, 0, len(detail.Ingredients))
	for _, item := range detail.Ingredients {
		ingredients = append(ingredients, toProtoRecipeIngredient(item))
	}
	steps := make([]*v1.RecipeStep, 0, len(detail.Steps))
	for _, item := range detail.Steps {
		steps = append(steps, toProtoRecipeStep(item))
	}
	return &v1.RecipeDetail{
		Recipe:      toProtoRecipe(detail.Recipe),
		Ingredients: ingredients,
		Steps:       steps,
	}
}

func toProtoMediaAsset(model *data.MediaAsset) *v1.MediaAsset {
	if model == nil {
		return nil
	}
	return &v1.MediaAsset{
		Id:          model.ID,
		HouseholdId: model.HouseholdID,
		UserId:      model.UserID,
		MediaType:   model.MediaType,
		FileName:    model.FileName,
		ContentType: model.ContentType,
		SizeBytes:   model.SizeBytes,
		Bucket:      model.Bucket,
		ObjectKey:   model.ObjectKey,
		StorageUrl:  model.StorageURL,
		Source:      model.Source,
		Metadata:    jsonMapToStruct(model.MetadataJSON),
		CreatedAt:   toTimestamp(model.CreatedAt),
		UpdatedAt:   toTimestamp(model.UpdatedAt),
	}
}

func toProtoImportJob(model *data.ImportJob) *v1.ImportJob {
	if model == nil {
		return nil
	}
	return &v1.ImportJob{
		Id:                model.ID,
		HouseholdId:       model.HouseholdID,
		UserId:            model.UserID,
		InputType:         model.InputType,
		Status:            model.Status,
		Stage:             model.Stage,
		RecipeId:          model.RecipeID,
		InputPayload:      jsonBytesToStruct(model.InputPayload),
		NormalizedPayload: jsonBytesToStruct(model.NormalizedPayload),
		ErrorMessage:      model.ErrorMessage,
		CreatedAt:         toTimestamp(model.CreatedAt),
		UpdatedAt:         toTimestamp(model.UpdatedAt),
	}
}

func toProtoKnowledgeBase(model *data.KnowledgeBase) *v1.KnowledgeBase {
	if model == nil {
		return nil
	}
	return &v1.KnowledgeBase{
		Id:               model.ID,
		HouseholdId:      model.HouseholdID,
		Name:             model.Name,
		Description:      model.Description,
		Status:           model.Status,
		DefaultTopK:      int32(model.DefaultTopK),
		DefaultChunkSize: int32(model.DefaultChunkSize),
		Metadata:         jsonMapToStruct(model.MetadataJSON),
		CreatedAt:        toTimestamp(model.CreatedAt),
		UpdatedAt:        toTimestamp(model.UpdatedAt),
	}
}

func toProtoKnowledgeDocument(model *data.KnowledgeDocument) *v1.KnowledgeDocument {
	if model == nil {
		return nil
	}
	return &v1.KnowledgeDocument{
		Id:              model.ID,
		KnowledgeBaseId: model.KnowledgeBaseID,
		MediaAssetId:    model.MediaAssetID,
		Title:           model.Title,
		FileName:        model.FileName,
		ContentType:     model.ContentType,
		Bucket:          model.Bucket,
		ObjectKey:       model.ObjectKey,
		Status:          model.Status,
		TextContent:     model.TextContent,
		Summary:         model.Summary,
		Metadata:        jsonMapToStruct(model.MetadataJSON),
		CreatedAt:       toTimestamp(model.CreatedAt),
		UpdatedAt:       toTimestamp(model.UpdatedAt),
	}
}

func toProtoAISession(model *data.AISession) *v1.AISession {
	if model == nil {
		return nil
	}
	return &v1.AISession{
		Id:          model.ID,
		HouseholdId: model.HouseholdID,
		UserId:      model.UserID,
		RecipeId:    model.RecipeID,
		Scene:       model.Scene,
		Title:       model.Title,
		Context:     jsonMapToStruct(model.ContextJSON),
		CreatedAt:   toTimestamp(model.CreatedAt),
		UpdatedAt:   toTimestamp(model.UpdatedAt),
	}
}

func toProtoAIMessage(model *data.AIMessage) *v1.AIMessage {
	if model == nil {
		return nil
	}

	var quote airuntime.QuoteContext
	_ = json.Unmarshal(model.QuoteContextJSON, &quote)
	var attachments []airuntime.Attachment
	_ = json.Unmarshal(model.AttachmentsJSON, &attachments)
	var sources []airuntime.Source
	_ = json.Unmarshal(model.ResponseMetaJSON, &sources)

	return &v1.AIMessage{
		Id:              model.ID,
		AiSessionId:     model.AISessionID,
		Role:            model.Role,
		Content:         model.Content,
		Mode:            model.Mode,
		QuoteContext:    toProtoQuoteContext(quote),
		Attachments:     toProtoAttachments(attachments),
		ResponseSources: toProtoSources(sources),
		CreatedAt:       toTimestamp(model.CreatedAt),
		UpdatedAt:       toTimestamp(model.UpdatedAt),
	}
}

func toProtoQuoteContext(model airuntime.QuoteContext) *v1.QuoteContext {
	if model == (airuntime.QuoteContext{}) {
		return nil
	}
	return &v1.QuoteContext{
		SelectedText:    model.SelectedText,
		SelectionSource: model.SelectionSource,
		SurroundingText: model.SurroundingText,
		Scene:           model.Scene,
	}
}

func fromProtoQuoteContext(model *v1.QuoteContext) airuntime.QuoteContext {
	if model == nil {
		return airuntime.QuoteContext{}
	}
	return airuntime.QuoteContext{
		SelectedText:    model.GetSelectedText(),
		SelectionSource: model.GetSelectionSource(),
		SurroundingText: model.GetSurroundingText(),
		Scene:           model.GetScene(),
	}
}

func toProtoAttachments(items []airuntime.Attachment) []*v1.Attachment {
	result := make([]*v1.Attachment, 0, len(items))
	for _, item := range items {
		result = append(result, &v1.Attachment{
			Type:        item.Type,
			Url:         item.URL,
			ContentType: item.ContentType,
			Name:        item.Name,
		})
	}
	return result
}

func fromProtoAttachments(items []*v1.Attachment) []airuntime.Attachment {
	result := make([]airuntime.Attachment, 0, len(items))
	for _, item := range items {
		result = append(result, airuntime.Attachment{
			Type:        item.GetType(),
			URL:         item.GetUrl(),
			ContentType: item.GetContentType(),
			Name:        item.GetName(),
		})
	}
	return result
}

func toProtoSources(items []airuntime.Source) []*v1.Source {
	result := make([]*v1.Source, 0, len(items))
	for _, item := range items {
		result = append(result, &v1.Source{
			Title:      item.Title,
			DocumentId: item.DocumentID,
			Snippet:    item.Snippet,
		})
	}
	return result
}

func jsonArrayToStrings(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var result []string
	if err := json.Unmarshal(raw, &result); err == nil {
		return result
	}
	return nil
}

func jsonMapToStruct(raw map[string]any) *structpb.Struct {
	if len(raw) == 0 {
		return nil
	}
	value, err := structpb.NewStruct(raw)
	if err != nil {
		return nil
	}
	return value
}

func jsonBytesToStruct(raw []byte) *structpb.Struct {
	if len(raw) == 0 {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil
	}
	return jsonMapToStruct(payload)
}

func structToJSONRaw(value *structpb.Struct) json.RawMessage {
	if value == nil {
		return nil
	}
	payload, err := json.Marshal(value.AsMap())
	if err != nil {
		return nil
	}
	return payload
}

func toTimestamp(value time.Time) *timestamppb.Timestamp {
	if value.IsZero() {
		return nil
	}
	return timestamppb.New(value)
}

func stringifyInt64(value int64) string {
	return strconv.FormatInt(value, 10)
}
