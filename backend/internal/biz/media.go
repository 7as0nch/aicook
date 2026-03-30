package biz

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
	"github.com/chengjiang/aicook/backend/internal/utils"
)

type MediaRepo interface {
	Create(ctx context.Context, asset *data.MediaAsset) error
	Get(ctx context.Context, id int64) (*data.MediaAsset, error)
	ListByIDs(ctx context.Context, ids []int64) ([]*data.MediaAsset, error)
}

type PrepareUploadRequest struct {
	HouseholdID int64
	UserID      int64
	MediaKind   string
	FileName    string
	ContentType string
	SizeBytes   int64
}

type PrepareUploadResult struct {
	Asset         *data.MediaAsset
	ObjectKey     string
	UploadURL     string
	UploadHeaders map[string]string
}

type MediaUsecase struct {
	repo             MediaRepo
	objectStorage    storage.ObjectStorage
	mediaBucket      string
	knowledgeBucket  string
	publicEndpoint   string
	presignGetExpiry time.Duration
}

func NewMediaUsecase(repo *data.MediaRepo, objectStorage storage.ObjectStorage, cfg *conf.Bootstrap) *MediaUsecase {
	publicEndpoint := storage.ResolvePublicEndpoint(cfg.GetOss())
	return &MediaUsecase{
		repo:             repo,
		objectStorage:    objectStorage,
		mediaBucket:      cfg.GetOss().GetMediaBucket(),
		knowledgeBucket:  cfg.GetOss().GetKnowledgeBucket(),
		publicEndpoint:   publicEndpoint,
		presignGetExpiry: 24 * time.Hour,
	}
}

// SignMediaURL 将指向本 OSS（公共访问域名）的直链换成短期预签名 GET，便于浏览器在私有桶下展示图片。
// 非本站 URL（如外链图床）原样返回。
func (u *MediaUsecase) SignMediaURL(ctx context.Context, raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || u == nil || u.objectStorage == nil {
		return raw, nil
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return raw, nil
	}
	pub := strings.TrimSpace(u.publicEndpoint)
	if pub == "" {
		return raw, nil
	}
	target, err := url.Parse(raw)
	if err != nil {
		return raw, nil
	}
	base, err := url.Parse(pub)
	if err != nil {
		return raw, nil
	}
	if !strings.EqualFold(target.Scheme, base.Scheme) || !strings.EqualFold(target.Host, base.Host) {
		return raw, nil
	}
	path := strings.TrimPrefix(target.Path, "/")
	if path == "" {
		return raw, nil
	}
	var bucket, objectKey string
	switch {
	case u.mediaBucket != "" && strings.HasPrefix(path, u.mediaBucket+"/"):
		bucket = u.mediaBucket
		objectKey = strings.TrimPrefix(path, u.mediaBucket+"/")
	case u.knowledgeBucket != "" && strings.HasPrefix(path, u.knowledgeBucket+"/"):
		bucket = u.knowledgeBucket
		objectKey = strings.TrimPrefix(path, u.knowledgeBucket+"/")
	default:
		return raw, nil
	}
	if objectKey == "" {
		return raw, nil
	}
	exp := u.presignGetExpiry
	if exp <= 0 {
		exp = 24 * time.Hour
	}
	signed, err := u.objectStorage.PresignGetObject(ctx, bucket, objectKey, exp)
	if err != nil {
		return raw, err
	}
	signed, err = storage.RewritePresignedHost(signed, u.publicEndpoint)
	if err != nil {
		return raw, err
	}
	return signed, nil
}

func (u *MediaUsecase) PrepareUpload(ctx context.Context, req PrepareUploadRequest) (*PrepareUploadResult, error) {
	mediaType := normalizeMediaKind(req.MediaKind)
	if mediaType == "" {
		return nil, fmt.Errorf("unsupported media kind: %s", req.MediaKind)
	}

	objectKey := buildObjectKey(mediaType, req.HouseholdID, req.FileName)
	asset := &data.MediaAsset{
		HouseholdID: req.HouseholdID,
		UserID:      req.UserID,
		MediaType:   mediaType,
		FileName:    req.FileName,
		ContentType: req.ContentType,
		SizeBytes:   req.SizeBytes,
		Bucket:      u.mediaBucket,
		ObjectKey:   objectKey,
		StorageURL:  buildStorageURL(u.publicEndpoint, u.mediaBucket, objectKey),
		Source:      "upload",
	}
	if err := u.repo.Create(ctx, asset); err != nil {
		return nil, err
	}

	uploadURL, err := u.objectStorage.PresignPutObject(ctx, u.mediaBucket, objectKey, 15*time.Minute)
	if err != nil {
		return nil, err
	}
	uploadURL, err = storage.RewritePresignedHost(uploadURL, u.publicEndpoint)
	if err != nil {
		return nil, err
	}

	return &PrepareUploadResult{
		Asset:     asset,
		ObjectKey: objectKey,
		UploadURL: uploadURL,
		UploadHeaders: map[string]string{
			"Content-Type": req.ContentType,
		},
	}, nil
}

func (u *MediaUsecase) CompleteUpload(ctx context.Context, assetID int64) (*data.MediaAsset, error) {
	asset, err := u.repo.Get(ctx, assetID)
	if err != nil {
		return nil, err
	}
	if _, err := u.objectStorage.StatObject(ctx, asset.Bucket, asset.ObjectKey); err != nil {
		return nil, err
	}
	return asset, nil
}

func (u *MediaUsecase) Get(ctx context.Context, id int64) (*data.MediaAsset, error) {
	return u.repo.Get(ctx, id)
}

func normalizeMediaKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "image", "images":
		return "image"
	case "audio", "voice":
		return "audio"
	case "document", "knowledge", "knowledge_document":
		return "document"
	default:
		return ""
	}
}

func buildObjectKey(mediaType string, householdID int64, fileName string) string {
	ext := filepath.Ext(fileName)
	if ext == "" {
		ext = ".bin"
	}
	return fmt.Sprintf("%s/%d/%d%s", mediaType, householdID, utils.GetSFID(), ext)
}

func buildStorageURL(publicEndpoint, bucket, objectKey string) string {
	if strings.TrimSpace(publicEndpoint) == "" {
		return fmt.Sprintf("minio://%s/%s", bucket, objectKey)
	}
	base, err := url.Parse(publicEndpoint)
	if err != nil {
		return fmt.Sprintf("minio://%s/%s", bucket, objectKey)
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/" + bucket + "/" + objectKey
	return base.String()
}
