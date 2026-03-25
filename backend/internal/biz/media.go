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
	repo           MediaRepo
	objectStorage  storage.ObjectStorage
	mediaBucket    string
	publicEndpoint string
}

func NewMediaUsecase(repo *data.MediaRepo, objectStorage storage.ObjectStorage, cfg *conf.Bootstrap) *MediaUsecase {
	return &MediaUsecase{
		repo:           repo,
		objectStorage:  objectStorage,
		mediaBucket:    cfg.GetOss().GetMediaBucket(),
		publicEndpoint: cfg.GetOss().GetPublicEndpoint(),
	}
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
