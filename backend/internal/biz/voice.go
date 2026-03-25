package biz

import (
	"context"

	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/inference"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
)

type VoiceUsecase struct {
	mediaRepo     MediaRepo
	objectStorage storage.ObjectStorage
	inference     *inference.Client
}

func NewVoiceUsecase(mediaRepo *data.MediaRepo, objectStorage storage.ObjectStorage, inferenceClient *inference.Client) *VoiceUsecase {
	return &VoiceUsecase{
		mediaRepo:     mediaRepo,
		objectStorage: objectStorage,
		inference:     inferenceClient,
	}
}

func (u *VoiceUsecase) TranscribeAsset(ctx context.Context, assetID int64) (*inference.SpeechResult, error) {
	asset, err := u.mediaRepo.Get(ctx, assetID)
	if err != nil {
		return nil, err
	}

	payload, err := u.objectStorage.GetObject(ctx, asset.Bucket, asset.ObjectKey)
	if err != nil {
		return nil, err
	}

	return u.inference.Transcribe(ctx, inference.FilePayload{
		FileName:    asset.FileName,
		ContentType: asset.ContentType,
		Data:        payload,
	})
}
