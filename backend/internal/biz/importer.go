package biz

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime"
	"github.com/chengjiang/aicook/backend/internal/platform/inference"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
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
	mediaRepo     MediaRepo
	recipeRepo    RecipeRepo
	objectStorage storage.ObjectStorage
	inference     *inference.Client
	aiRuntime     *airuntime.Runtime
}

func NewImportUsecase(repo *data.ImportRepo, mediaRepo *data.MediaRepo, recipeRepo *data.RecipeRepo, objectStorage storage.ObjectStorage, inferenceClient *inference.Client, aiRuntime *airuntime.Runtime) *ImportUsecase {
	return &ImportUsecase{
		repo:          repo,
		mediaRepo:     mediaRepo,
		recipeRepo:    recipeRepo,
		objectStorage: objectStorage,
		inference:     inferenceClient,
		aiRuntime:     aiRuntime,
	}
}

func (u *ImportUsecase) CreateImageRecipe(ctx context.Context, req CreateImageRecipeRequest) (*data.ImportJob, error) {
	payload, _ := json.Marshal(req)
	job := &data.ImportJob{
		HouseholdID:  req.HouseholdID,
		UserID:       req.UserID,
		InputType:    "image_tutorial",
		Status:       "processing",
		Stage:        "ocr",
		InputPayload: payload,
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

	ocrResult, err := u.inference.OCR(ctx, files)
	if err != nil {
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "ocr", nil, nil, err.Error())
		return nil, err
	}

	draft, err := u.aiRuntime.GenerateImageRecipeDraft(ctx, airuntime.ImageRecipeDraftInput{
		TitleHint: req.TitleHint,
		OCRText:   ocrResult.Text,
		Images:    attachments,
	})
	if err != nil {
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "normalize", nil, nil, err.Error())
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
		"ocr_text": ocrResult.Text,
		"draft":    draft,
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
