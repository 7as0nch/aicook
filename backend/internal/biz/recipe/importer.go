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
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
	"github.com/go-kratos/kratos/v2/log"
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
	// Preview=true：只识别、不落库，把草稿与图片 URL 放进 job.normalized_payload，
	// 由前端跳编辑页预填、用户确认后再手动保存为草稿（拍照/工作台走此模式）。
	// Preview=false：识别后直接落库为草稿（AI 对话图文识别走此模式，保持原行为）。
	Preview bool
}

type ImportUsecase struct {
	repo          ImportRepo
	mediaRepo     user.MediaRepo
	mediaUsecase  *user.MediaUsecase
	recipeRepo    RecipeRepo
	objectStorage storage.ObjectStorage
	aiRuntime     *airuntime.Runtime
}

func NewImportUsecase(repo *data.ImportRepo, mediaRepo *data.MediaRepo, mediaUsecase *user.MediaUsecase, recipeRepo *data.RecipeRepo, objectStorage storage.ObjectStorage, aiRuntime *airuntime.Runtime) *ImportUsecase {
	usecase := &ImportUsecase{
		repo:          repo,
		mediaRepo:     mediaRepo,
		mediaUsecase:  mediaUsecase,
		recipeRepo:    recipeRepo,
		objectStorage: objectStorage,
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
		// 各失败分支记录 job_id + 阶段名，便于按链路排查识别失败
		log.Errorf("image recipe import failed: job_id=%d stage=fetch_media asset_ids=%v err=%v", job.ID, req.MediaAssetIDs, err)
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "ocr", nil, nil, err.Error())
		return nil, err
	}

	// 仅取图片附件交给多模态视觉模型（vision_model 直接识图，已不再走 OCR）。
	// attachments 存原始 StorageURL（封面入库用，读时再签名）；visionImages 用签名 URL
	// 给后端拉取——StorageURL 未签名，后端 imageinput 直接 GET 会 403。
	attachments := make([]airuntime.Attachment, 0, len(assets))
	visionImages := make([]airuntime.Attachment, 0, len(assets))
	for _, asset := range assets {
		raw := airuntime.Attachment{
			Type:        "image",
			URL:         asset.StorageURL,
			ContentType: asset.ContentType,
			Name:        asset.FileName,
		}
		attachments = append(attachments, raw)
		vi := raw
		if u.mediaUsecase != nil {
			if signed, err := u.mediaUsecase.SignMediaURL(ctx, asset.StorageURL); err == nil && signed != "" {
				vi.URL = signed
			}
		}
		visionImages = append(visionImages, vi)
	}

	// vision 直识别（图片由运行时拉取后 base64 内联给 MiMo，不传内网 URL）。
	// 无 OCR 文本时多模态失败会直接返回 err（不再回退空壳启发式草稿），由调用方据 err 置 failed。
	draft, draftSource, err := u.aiRuntime.GenerateImageRecipeDraft(ctx, airuntime.ImageRecipeDraftInput{
		TitleHint: req.TitleHint,
		Images:    visionImages,
	})
	if err != nil {
		log.Errorf("image recipe import failed: job_id=%d stage=ai_draft draft_source=%s err=%v", job.ID, draftSource, err)
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "normalize", nil, map[string]any{
			"draft_source": draftSource,
		}, err.Error())
		return nil, err
	}

	// 非菜谱（如宠物/风景/无关物体）：不落库，job 置 failed 并带上中文理由，
	// 由前端据 job.status/error_message 提示用户「为何无法创建」。
	if !draft.IsRecipe {
		reason := strings.TrimSpace(draft.RejectReason)
		if reason == "" {
			reason = "图片中未识别到可制作的菜谱，请上传菜谱或菜品图片。"
		}
		log.Infof("image recipe import rejected: job_id=%d reason=%s", job.ID, reason)
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "normalize", nil, map[string]any{
			"draft_source":  draftSource,
			"is_recipe":     false,
			"reject_reason": reason,
		}, reason)
		updated, err := u.repo.Get(ctx, job.ID)
		if err != nil {
			return nil, fmt.Errorf("load import job failed: %w", err)
		}
		return updated, nil
	}

	cover := firstAttachmentURL(attachments)
	galleryURLs := make([]string, 0, len(attachments))
	for _, a := range attachments {
		if a.URL != "" {
			galleryURLs = append(galleryURLs, a.URL)
		}
	}

	// 预览模式：不落库，把识别草稿 + 图片 URL 放进 normalized_payload，
	// 前端据此跳编辑页预填，用户确认后再手动保存为草稿（避免后台静默建草稿）。
	if req.Preview {
		resultPayload := map[string]any{
			"draft":              draft,
			"draft_source":       draftSource,
			"cover_image_url":    cover,
			"gallery_image_urls": galleryURLs,
		}
		if err := u.repo.UpdateResult(ctx, job.ID, "review_required", "preview", nil, resultPayload, ""); err != nil {
			return nil, err
		}
		updated, err := u.repo.Get(ctx, job.ID)
		if err != nil {
			return nil, fmt.Errorf("load import job failed: %w", err)
		}
		return updated, nil
	}

	recipe := &data.Recipe{
		HouseholdID:   req.HouseholdID,
		OwnerUserID:   req.UserID,
		Title:         draft.Title,
		Summary:       draft.Summary,
		CoverImageURL: cover,
		// 默认存草稿：菜谱页带「草稿」徽标可见、可一键发布；首页/推荐/选菜只显示已发布。
		Status: "draft",
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
		log.Errorf("image recipe import failed: job_id=%d stage=persist err=%v", job.ID, err)
		_ = u.repo.UpdateResult(ctx, job.ID, "failed", "persist", nil, nil, err.Error())
		return nil, err
	}

	resultPayload := map[string]any{
		"draft":        draft,
		"draft_source": draftSource,
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
	// 非菜谱：未落库（RecipeID 为空），回退为拒绝卡片，把理由透传给用户。
	if job.RecipeID == nil {
		reason := strings.TrimSpace(job.ErrorMessage)
		if reason == "" {
			reason = "图片中未识别到可制作的菜谱。"
		}
		return &airuntime.RecipeCard{
			Title:        "无法生成菜谱",
			Summary:      reason,
			Status:       "rejected",
			Source:       "image_recipe",
			IsRecipe:     false,
			RejectReason: reason,
		}, nil
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
