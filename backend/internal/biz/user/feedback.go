package user

import (
	"context"
	"strings"

	apierrors "github.com/chengjiang/aicook/backend/api/aicook/errors"
	"github.com/chengjiang/aicook/backend/internal/biz/common"
	"github.com/chengjiang/aicook/backend/internal/data"
	"gorm.io/datatypes"
)

const (
	feedbackContentMaxLen = 1000
	feedbackContactMaxLen = 120
	feedbackMaxImages     = 9
)

// FeedbackUsecase 负责用户意见反馈的写入与读取；截图以 media_assets.id 形式存储，读时再签名。
type FeedbackUsecase struct {
	repo  *data.FeedbackRepo
	media *MediaUsecase
}

func NewFeedbackUsecase(repo *data.FeedbackRepo, media *MediaUsecase) *FeedbackUsecase {
	return &FeedbackUsecase{repo: repo, media: media}
}

// CreateFeedbackInput 前端提交反馈时的入参。
type CreateFeedbackInput struct {
	Category      string
	Content       string
	Contact       string
	ImageAssetIDs []int64
}

// Create 写入一条反馈。content 必填；category 归一到允许集合；截图校验归属当前 household。
func (u *FeedbackUsecase) Create(ctx context.Context, actor common.Actor, in CreateFeedbackInput) (*data.Feedback, error) {
	content := strings.TrimSpace(in.Content)
	if content == "" {
		return nil, apierrors.ErrorInvalidArgument("反馈内容不能为空")
	}
	if len([]rune(content)) > feedbackContentMaxLen {
		content = string([]rune(content)[:feedbackContentMaxLen])
	}

	contact := strings.TrimSpace(in.Contact)
	if len([]rune(contact)) > feedbackContactMaxLen {
		contact = string([]rune(contact)[:feedbackContactMaxLen])
	}

	entry := &data.Feedback{
		HouseholdID:   actor.HouseholdID,
		UserID:        actor.UserID,
		Category:      normalizeFeedbackCategory(in.Category),
		Content:       content,
		ImageAssetIDs: u.sanitizeImageAssetIDs(ctx, actor, in.ImageAssetIDs),
		Contact:       contact,
		Status:        "pending",
	}
	if err := u.repo.Create(ctx, entry); err != nil {
		return nil, err
	}
	return entry, nil
}

// List 返回当前用户的反馈，使用游标分页（id 倒序）。
func (u *FeedbackUsecase) List(ctx context.Context, actor common.Actor, limit int, beforeID int64) ([]*data.Feedback, int64, error) {
	items, err := u.repo.ListByUser(ctx, actor.UserID, limit, beforeID)
	if err != nil {
		return nil, 0, err
	}
	var nextCursor int64
	if limit > 0 && len(items) >= limit && len(items) > 0 {
		nextCursor = items[len(items)-1].ID
	}
	return items, nextCursor, nil
}

// SignedImageURLs 把存储的 asset id 列表解析成可访问的预签名 URL，供 service 层下发。
// 解析失败（资产被删等）的 id 静默跳过，不影响整体展示。
func (u *FeedbackUsecase) SignedImageURLs(ctx context.Context, ids datatypes.JSONSlice[int64]) []string {
	if u.media == nil || len(ids) == 0 {
		return nil
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		signed, err := u.media.SignedURLForAsset(ctx, id)
		if err != nil || signed == "" {
			continue
		}
		out = append(out, signed)
	}
	return out
}

// sanitizeImageAssetIDs 去零、去重、校验归属当前 household，并截断到上限。
func (u *FeedbackUsecase) sanitizeImageAssetIDs(ctx context.Context, actor common.Actor, ids []int64) datatypes.JSONSlice[int64] {
	if len(ids) == 0 {
		return datatypes.JSONSlice[int64]{}
	}
	seen := make(map[int64]struct{}, len(ids))
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		// 校验资产存在且属于当前 household，避免引用他人/无效资产。
		if u.media != nil {
			asset, err := u.media.Get(ctx, id)
			if err != nil || asset == nil || asset.HouseholdID != actor.HouseholdID {
				continue
			}
		}
		out = append(out, id)
		if len(out) >= feedbackMaxImages {
			break
		}
	}
	return datatypes.JSONSlice[int64](out)
}

func normalizeFeedbackCategory(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "suggestion", "bug", "other":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "other"
	}
}
