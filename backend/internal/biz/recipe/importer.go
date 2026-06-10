package recipe

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"github.com/chengjiang/aicook/backend/internal/platform/inference"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
	"gorm.io/datatypes"
)

type ImportRepo interface {
	Create(ctx context.Context, job *data.ImportJob) error
	UpdateResult(ctx context.Context, jobID int64, status, stage string, recipeID *int64, payload any, errMsg string) error
	Get(ctx context.Context, jobID int64) (*data.ImportJob, error)
}

type CreateImageRecipeRequest struct {
	HouseholdID   int64
	UserID        int64
	MediaAssetIDs []int64
	TitleHint     string
}

type ImportUsecase struct {
	repo          ImportRepo
	mediaRepo     user.MediaRepo
	recipeRepo    RecipeRepo
	objectStorage storage.ObjectStorage
	inference     *inference.Client
	aiRuntime     *airuntime.Runtime
}

func NewImportUsecase(repo *data.ImportRepo, mediaRepo *data.MediaRepo, recipeRepo *data.RecipeRepo, objectStorage storage.ObjectStorage, inferenceClient *inference.Client, aiRuntime *airuntime.Runtime) *ImportUsecase {
	usecase := &ImportUsecase{
		repo:          repo,
		mediaRepo:     mediaRepo,
		recipeRepo:    recipeRepo,
		objectStorage: objectStorage,
		inference:     inferenceClient,
		aiRuntime:     aiRuntime,
	}
	if aiRuntime != nil {
		aiRuntime.RegisterImageRecipeCreator(usecase)
	}
	return usecase
}

func (u *ImportUsecase) CreateImageRecipe(ctx context.Context, req CreateImageRecipeRequest) (*data.ImportJob, error) {
	payload, _ := json.Marshal(req)
	job := &data.ImportJob{
		HouseholdID:  req.HouseholdID,
		UserID:       req.UserID,
		InputType:    "image_tutorial",
		Status:       "processing",
		Stage:        "multimodal",
		InputPayload: payload,
		NormalizedPayload: datatypes.JSON([]byte("{}")),
	}
	if err := u.repo.Create(ctx, job); err != nil {
		return nil, err
	}

	assets, err := u.mediaRepo.ListByIDs(ctx, req.MediaAssetIDs)
	if err != nil {
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "ocr", nil, nil, err.Error())
		return nil, err
	}

	files := make([]inference.FilePayload, 0, len(assets))
	attachments := make([]airuntime.Attachment, 0, len(assets))
	for _, asset := range assets {
		content, readErr := u.objectStorage.GetObject(ctx, asset.Bucket, asset.ObjectKey)
		if readErr != nil {
			_ = u.repo.UpdateResult(ctx, job.ID, "failed", "ocr", nil, nil, readErr.Error())
			return nil, readErr
		}
		files = append(files, inference.FilePayload{
			FileName:    asset.FileName,
			ContentType: asset.ContentType,
			Data:        content,
		})
		attachments = append(attachments, airuntime.Attachment{
			Type:        "image",
			URL:         asset.StorageURL,
			ContentType: asset.ContentType,
			Name:        asset.FileName,
		})
	}

	draft, draftSource, err := u.aiRuntime.GenerateImageRecipeDraft(ctx, airuntime.ImageRecipeDraftInput{
		TitleHint: req.TitleHint,
		Images:    attachments,
	})
	var ocrText string
	var multimodalError string
	if err != nil {
		multimodalError = err.Error()
		ocrResult, ocrErr := u.inference.OCR(ctx, files)
		if ocrErr != nil {
			_ = u.repo.UpdateResult(ctx, job.ID, "failed", "ocr", nil, map[string]any{
				"multimodal_error": multimodalError,
			}, ocrErr.Error())
			return nil, ocrErr
		}
		ocrText = ocrResult.Text
		draft, draftSource, err = u.aiRuntime.GenerateImageRecipeDraft(ctx, airuntime.ImageRecipeDraftInput{
			TitleHint: req.TitleHint,
			OCRText:   ocrText,
			Images:    attachments,
		})
	}
	if err != nil {
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "normalize", nil, map[string]any{
			"draft_source":      draftSource,
			"multimodal_error":  multimodalError,
			"ocr_text":          ocrText,
			"fallback_attempted": ocrText != "",
		}, err.Error())
		return nil, err
	}

	recipe := &data.Recipe{
		HouseholdID:   req.HouseholdID,
		OwnerUserID:   req.UserID,
		Title:         draft.Title,
		Summary:       draft.Summary,
		CoverImageURL: firstAttachmentURL(attachments),
		Status:        "review",
		SourceType:    "image_tutorial",
		Category:      draft.Category,
		TotalMinutes:  draft.TotalMinutes,
		Difficulty:    draft.Difficulty,
		ScenarioTags:  datatypes.JSON([]byte("[]")),
		FlavorTags:    datatypes.JSON([]byte("[]")),
		Tools:         mustJSON(draft.Tools),
		MetadataJSON:  datatypes.JSONMap{},
	}

	ingredients := make([]*data.RecipeIngredient, 0, len(draft.Ingredients))
	for idx, ingredient := range draft.Ingredients {
		ingredients = append(ingredients, &data.RecipeIngredient{
			SortOrder:   idx + 1,
			GroupName:   ingredient.GroupName,
			Name:        ingredient.Name,
			AmountText:  ingredient.AmountText,
			Preparation: ingredient.Preparation,
		})
	}

	steps := make([]*data.RecipeStep, 0, len(draft.Steps))
	for idx, step := range draft.Steps {
		steps = append(steps, &data.RecipeStep{
			StepNo:         idx + 1,
			Title:          step.Title,
			Description:    step.Description,
			StepType:       step.StepType,
			NeedTimer:      step.NeedTimer,
			TimerSeconds:   step.TimerSeconds,
			TimerAnimation: step.TimerAnimation,
			EndCondition:   step.EndCondition,
		})
	}

	if err := u.recipeRepo.CreateDraft(ctx, recipe, ingredients, steps); err != nil {
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "persist", nil, nil, err.Error())
		return nil, err
	}

	resultPayload := map[string]any{
		"ocr_text":           ocrText,
		"draft":              draft,
		"draft_source":       draftSource,
		"multimodal_error":   multimodalError,
		"fallback_attempted": ocrText != "",
	}
	if err := u.repo.UpdateResult(ctx, job.ID, "review_required", "done", &recipe.ID, resultPayload, ""); err != nil {
		return nil, err
	}

	updated, err := u.repo.Get(ctx, job.ID)
	if err != nil {
		return nil, fmt.Errorf("load import job failed: %w", err)
	}
	return updated, nil
}

func (u *ImportUsecase) GetJob(ctx context.Context, jobID int64) (*data.ImportJob, error) {
	return u.repo.Get(ctx, jobID)
}

func firstAttachmentURL(attachments []airuntime.Attachment) string {
	if len(attachments) == 0 {
		return ""
	}
	return attachments[0].URL
}

func mustJSON(v any) datatypes.JSON {
	raw, err := json.Marshal(v)
	if err != nil || len(raw) == 0 {
		return datatypes.JSON([]byte("[]"))
	}
	return datatypes.JSON(raw)
}

func (u *ImportUsecase) CreateImageRecipeCardForAI(ctx context.Context, householdID, userID int64, attachments []airuntime.Attachment, titleHint string) (*airuntime.RecipeCard, error) {
	mediaAssetIDs := make([]int64, 0, len(attachments))
	for _, attachment := range attachments {
		if id := strings.TrimSpace(attachment.AssetID); id != "" {
			var parsed int64
			if _, err := fmt.Sscanf(id, "%d", &parsed); err == nil && parsed > 0 {
				mediaAssetIDs = append(mediaAssetIDs, parsed)
			}
		}
	}
	if len(mediaAssetIDs) == 0 {
		return &airuntime.RecipeCard{
			Title:        "未找到可识别图片",
			Summary:      "图文识别需要先上传图片资源后再发送。",
			Status:       "rejected",
			Source:       "image_recipe",
			IsRecipe:     false,
			RejectReason: "图文识别需要先上传图片资源后再发送。",
		}, nil
	}
	job, err := u.CreateImageRecipe(ctx, CreateImageRecipeRequest{
		HouseholdID:   householdID,
		UserID:        userID,
		MediaAssetIDs: mediaAssetIDs,
		TitleHint:     titleHint,
	})
	if err != nil {
		return nil, err
	}
	card := &airuntime.RecipeCard{
		Title:    "已生成菜谱草稿",
		Summary:  "已根据图片识别生成菜谱草稿，请确认后保存。",
		Time:     "时长待确认",
		Difficulty: "待确认",
		Status:   job.Status,
		Source:   "image_recipe",
		IsRecipe: true,
	}
	if job.RecipeID != nil {
		card.RecipeID = strconv.FormatInt(*job.RecipeID, 10)
	}
	var payload struct {
		Draft struct {
			Title        string `json:"title"`
			Summary      string `json:"summary"`
			TotalMinutes int    `json:"total_minutes"`
			Difficulty   int    `json:"difficulty"`
			Ingredients  []struct {
				Name string `json:"name"`
			} `json:"ingredients"`
		} `json:"draft"`
	}
	if len(job.NormalizedPayload) > 0 && json.Unmarshal(job.NormalizedPayload, &payload) == nil {
		if strings.TrimSpace(payload.Draft.Title) != "" {
			card.Title = strings.TrimSpace(payload.Draft.Title)
		}
		if strings.TrimSpace(payload.Draft.Summary) != "" {
			card.Summary = strings.TrimSpace(payload.Draft.Summary)
		}
		if payload.Draft.TotalMinutes > 0 {
			card.Time = fmt.Sprintf("%d 分钟", payload.Draft.TotalMinutes)
		}
		if payload.Draft.Difficulty > 0 {
			level := payload.Draft.Difficulty
			if level > 5 {
				level = 5
			}
			card.Difficulty = fmt.Sprintf("%s %d", strings.Repeat("★", level), payload.Draft.Difficulty)
		}
		for _, ingredient := range payload.Draft.Ingredients {
			name := strings.TrimSpace(ingredient.Name)
			if name != "" {
				card.Ingredients = append(card.Ingredients, name)
			}
			if len(card.Ingredients) >= 6 {
				break
			}
		}
	}
	return card, nil
}
