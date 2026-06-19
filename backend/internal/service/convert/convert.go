package convert

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	structpb "google.golang.org/protobuf/types/known/structpb"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"
)

func SignRecipeMediaURLs(ctx context.Context, m *user.MediaUsecase, r *v1.Recipe) {
	if m == nil || r == nil {
		return
	}
	if r.GetCoverImageUrl() != "" {
		if signed, err := m.SignMediaURL(ctx, r.GetCoverImageUrl()); err == nil && signed != "" {
			r.CoverImageUrl = signed
		}
	}
	g := r.GetGalleryImageUrls()
	for i, u := range g {
		if u == "" {
			continue
		}
		if signed, err := m.SignMediaURL(ctx, u); err == nil && signed != "" {
			g[i] = signed
		}
	}
	r.GalleryImageUrls = g
	if r.GetVideoUrl() != "" {
		if signed, err := m.SignMediaURL(ctx, r.GetVideoUrl()); err == nil && signed != "" {
			r.VideoUrl = signed
		}
	}
}

// signAIMessageMedia 把聊天消息里用户上传的图片附件 URL 重签为短期可访问的预签名 URL，
// 让历史消息里的图片在前端能直接预览（存的是 storage_url，未签名不可访问）。
func SignAIMessageMedia(ctx context.Context, m *user.MediaUsecase, msg *v1.AIMessage) {
	if m == nil || msg == nil {
		return
	}
	for _, a := range msg.GetAttachments() {
		if a == nil || a.GetUrl() == "" || !strings.EqualFold(a.GetType(), "image") {
			continue
		}
		if signed, err := m.SignMediaURL(ctx, a.GetUrl()); err == nil && signed != "" {
			a.Url = signed
		}
	}
}

func SignRecipeStepMediaURLs(ctx context.Context, m *user.MediaUsecase, s *v1.RecipeStep) {
	if m == nil || s == nil {
		return
	}
	if s.GetMediaUrl() != "" {
		if signed, err := m.SignMediaURL(ctx, s.GetMediaUrl()); err == nil && signed != "" {
			s.MediaUrl = signed
		}
	}
	mediaURLs := s.GetMediaUrls()
	for i, u := range mediaURLs {
		if u == "" {
			continue
		}
		if signed, err := m.SignMediaURL(ctx, u); err == nil && signed != "" {
			mediaURLs[i] = signed
		}
	}
	s.MediaUrls = mediaURLs
}

func SignRecipeDetailMediaURLs(ctx context.Context, m *user.MediaUsecase, d *v1.RecipeDetail) {
	if m == nil || d == nil {
		return
	}
	SignRecipeMediaURLs(ctx, m, d.Recipe)
	for _, step := range d.Steps {
		SignRecipeStepMediaURLs(ctx, m, step)
	}
}

func ToProtoRecipe(model *data.Recipe) *v1.Recipe {
	if model == nil {
		return nil
	}
	return &v1.Recipe{
		Id:                 model.ID,
		HouseholdId:        model.HouseholdID,
		OwnerUserId:        model.OwnerUserID,
		SourceHouseholdId:  model.SourceHouseholdID,
		ForkedFromRecipeId: model.ForkedFromRecipeID,
		Title:              model.Title,
		Summary:            model.Summary,
		CoverImageUrl:      model.CoverImageURL,
		GalleryImageUrls:   data.RecipeGalleryURLs(model),
		VideoUrl:           model.VideoURL,
		Status:             model.Status,
		SourceType:         model.SourceType,
		Language:           model.Language,
		Category:           model.Category,
		TotalMinutes:       int32(model.TotalMinutes),
		Difficulty:         int32(model.Difficulty),
		ScenarioTags:       JsonArrayToStrings(model.ScenarioTags),
		FlavorTags:         JsonArrayToStrings(model.FlavorTags),
		Tools:              JsonArrayToStrings(model.Tools),
		Metadata:           JsonMapToStruct(model.MetadataJSON),
		CreatedAt:          ToTimestamp(model.CreatedAt),
		UpdatedAt:          ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoHousehold(model *data.Household) *v1.HouseholdSummary {
	if model == nil {
		return nil
	}
	return &v1.HouseholdSummary{
		Id:        model.ID,
		Name:      model.Name,
		ShareCode: model.ShareCode,
		Timezone:  model.Timezone,
		CreatedAt: ToTimestamp(model.CreatedAt),
		UpdatedAt: ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoHouseholds(items []*data.Household) []*v1.HouseholdSummary {
	out := make([]*v1.HouseholdSummary, 0, len(items))
	for _, item := range items {
		out = append(out, ToProtoHousehold(item))
	}
	return out
}

func ToProtoUser(ctx context.Context, model *data.User, media *user.MediaUsecase) *v1.UserProfile {
	if model == nil {
		return nil
	}
	p := &v1.UserProfile{
		Id:          model.ID,
		HouseholdId: model.HouseholdID,
		Username:    model.Username,
		Phone:       model.Phone,
		DisplayName: model.DisplayName,
		Email:       model.Email,
		Status:      model.Status,
		CreatedAt:   ToTimestamp(model.CreatedAt),
		UpdatedAt:   ToTimestamp(model.UpdatedAt),
	}
	// 优先级：自上传头像（AvatarAssetID → 预签名 URL）> 外部直链（AvatarURL，多为微信默认头像）。
	if model.AvatarAssetID != nil && *model.AvatarAssetID != 0 && media != nil {
		if u, err := media.SignedURLForAsset(ctx, *model.AvatarAssetID); err == nil && u != "" {
			p.AvatarUrl = u
		}
	}
	if p.AvatarUrl == "" && model.AvatarURL != "" {
		p.AvatarUrl = model.AvatarURL
	}
	return p
}

func ToProtoKitchenTag(model *data.KitchenTag) *v1.KitchenTag {
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
		CreatedAt:   ToTimestamp(model.CreatedAt),
		UpdatedAt:   ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoRecipeIngredient(model *data.RecipeIngredient) *v1.RecipeIngredient {
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

func ToProtoRecipeStep(model *data.RecipeStep) *v1.RecipeStep {
	if model == nil {
		return nil
	}
	urls := data.RecipeStepMediaURLs(model)
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
		MediaUrls:      urls,
	}
}

func ToProtoRecipeDetail(detail *data.RecipeDetail) *v1.RecipeDetail {
	if detail == nil {
		return nil
	}
	ingredients := make([]*v1.RecipeIngredient, 0, len(detail.Ingredients))
	for _, item := range detail.Ingredients {
		ingredients = append(ingredients, ToProtoRecipeIngredient(item))
	}
	steps := make([]*v1.RecipeStep, 0, len(detail.Steps))
	for _, item := range detail.Steps {
		steps = append(steps, ToProtoRecipeStep(item))
	}
	return &v1.RecipeDetail{
		Recipe:      ToProtoRecipe(detail.Recipe),
		Ingredients: ingredients,
		Steps:       steps,
	}
}

func ToDraftIngredients(items []*v1.CreateRecipeDraftIngredient) []airuntime.DraftIngredient {
	result := make([]airuntime.DraftIngredient, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		result = append(result, airuntime.DraftIngredient{
			GroupName:   item.GetGroupName(),
			Name:        item.GetName(),
			AmountText:  item.GetAmountText(),
			Preparation: item.GetPreparation(),
		})
	}
	return result
}

func ToDraftSteps(items []*v1.CreateRecipeDraftStep) []airuntime.DraftStep {
	result := make([]airuntime.DraftStep, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		urls := append([]string(nil), item.GetMediaUrls()...)
		result = append(result, airuntime.DraftStep{
			Title:          item.GetTitle(),
			Description:    item.GetDescription(),
			StepType:       item.GetStepType(),
			NeedTimer:      item.GetNeedTimer(),
			TimerSeconds:   int(item.GetTimerSeconds()),
			TimerAnimation: item.GetTimerAnimation(),
			EndCondition:   item.GetEndCondition(),
			HeatLevel:      item.GetHeatLevel(),
			SafetyTips:     item.GetSafetyTips(),
			AIHint:         item.GetAiHint(),
			MediaURL:       item.GetMediaUrl(),
			MediaURLs:      urls,
		})
	}
	return result
}

func ToProtoMediaAsset(model *data.MediaAsset) *v1.MediaAsset {
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
		Metadata:    JsonMapToStruct(model.MetadataJSON),
		CreatedAt:   ToTimestamp(model.CreatedAt),
		UpdatedAt:   ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoImportJob(model *data.ImportJob) *v1.ImportJob {
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
		InputPayload:      JsonBytesToStruct(model.InputPayload),
		NormalizedPayload: JsonBytesToStruct(model.NormalizedPayload),
		ErrorMessage:      model.ErrorMessage,
		CreatedAt:         ToTimestamp(model.CreatedAt),
		UpdatedAt:         ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoKnowledgeBase(model *data.KnowledgeBase) *v1.KnowledgeBase {
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
		Metadata:         JsonMapToStruct(model.MetadataJSON),
		CreatedAt:        ToTimestamp(model.CreatedAt),
		UpdatedAt:        ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoKnowledgeDocument(model *data.KnowledgeDocument) *v1.KnowledgeDocument {
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
		Metadata:        JsonMapToStruct(model.MetadataJSON),
		CreatedAt:       ToTimestamp(model.CreatedAt),
		UpdatedAt:       ToTimestamp(model.UpdatedAt),
		ProcessingStage: model.ProcessingStage,
		ChunkCount:      int32(model.ChunkCount),
	}
}

func ToProtoAISession(model *data.AISession) *v1.AISession {
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
		Context:     JsonMapToStruct(model.ContextJSON),
		CreatedAt:   ToTimestamp(model.CreatedAt),
		UpdatedAt:   ToTimestamp(model.UpdatedAt),
	}
}

func ToProtoAIMessage(model *data.AIMessage) *v1.AIMessage {
	if model == nil {
		return nil
	}

	var quote airuntime.QuoteContext
	_ = json.Unmarshal(model.QuoteContextJSON, &quote)
	var attachments []airuntime.Attachment
	_ = json.Unmarshal(model.AttachmentsJSON, &attachments)
	var envelope struct {
		Sources  []airuntime.Source `json:"sources"`
		Metadata map[string]any     `json:"metadata"`
	}
	_ = json.Unmarshal(model.ResponseMetaJSON, &envelope)
	sources := envelope.Sources
	if len(sources) == 0 {
		_ = json.Unmarshal(model.ResponseMetaJSON, &sources)
	}

	return &v1.AIMessage{
		Id:              model.ID,
		AiSessionId:     model.AISessionID,
		Role:            model.Role,
		Content:         model.Content,
		Mode:            model.Mode,
		QuoteContext:    ToProtoQuoteContext(quote),
		Attachments:     ToProtoAttachments(attachments),
		ResponseSources: ToProtoSources(sources),
		CreatedAt:       ToTimestamp(model.CreatedAt),
		UpdatedAt:       ToTimestamp(model.UpdatedAt),
		ResponseMeta:    JsonMapToStruct(envelope.Metadata),
	}
}

func ToProtoQuoteContext(model airuntime.QuoteContext) *v1.QuoteContext {
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

func FromProtoQuoteContext(model *v1.QuoteContext) airuntime.QuoteContext {
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

func ToProtoAttachments(items []airuntime.Attachment) []*v1.Attachment {
	result := make([]*v1.Attachment, 0, len(items))
	for _, item := range items {
		result = append(result, &v1.Attachment{
			Type:        item.Type,
			Url:         item.URL,
			ContentType: item.ContentType,
			Name:        item.Name,
			AssetId:     item.AssetID,
		})
	}
	return result
}

func FromProtoAttachments(items []*v1.Attachment) []airuntime.Attachment {
	result := make([]airuntime.Attachment, 0, len(items))
	for _, item := range items {
		result = append(result, airuntime.Attachment{
			Type:        item.GetType(),
			URL:         item.GetUrl(),
			ContentType: item.GetContentType(),
			Name:        item.GetName(),
			AssetID:     item.GetAssetId(),
		})
	}
	return result
}

func ToProtoSources(items []airuntime.Source) []*v1.Source {
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

func JsonArrayToStrings(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var result []string
	if err := json.Unmarshal(raw, &result); err == nil {
		return result
	}
	return nil
}

func JsonMapToStruct(raw map[string]any) *structpb.Struct {
	if len(raw) == 0 {
		return nil
	}
	value, err := structpb.NewStruct(raw)
	if err != nil {
		return nil
	}
	return value
}

func JsonBytesToStruct(raw []byte) *structpb.Struct {
	if len(raw) == 0 {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil
	}
	return JsonMapToStruct(payload)
}

func StructToJSONRaw(value *structpb.Struct) json.RawMessage {
	if value == nil {
		return nil
	}
	payload, err := json.Marshal(value.AsMap())
	if err != nil {
		return nil
	}
	return payload
}

func ToTimestamp(value time.Time) *timestamppb.Timestamp {
	if value.IsZero() {
		return nil
	}
	return timestamppb.New(value)
}

func StringifyInt64(value int64) string {
	return strconv.FormatInt(value, 10)
}
