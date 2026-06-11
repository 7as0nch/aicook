package ai

import (
	"context"

	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/asr"
	"github.com/chengjiang/aicook/backend/internal/platform/storage"
)

type VoiceUsecase struct {
	mediaRepo     user.MediaRepo
	objectStorage storage.ObjectStorage
	asr           *asr.Client
}

func NewVoiceUsecase(mediaRepo *data.MediaRepo, objectStorage storage.ObjectStorage, asrClient *asr.Client) *VoiceUsecase {
	return &VoiceUsecase{
		mediaRepo:     mediaRepo,
		objectStorage: objectStorage,
		asr:           asrClient,
	}
}

func (u *VoiceUsecase) TranscribeAsset(ctx context.Context, assetID int64) (*asr.SpeechResult, error) {
	asset, err := u.mediaRepo.Get(ctx, assetID)
	if err != nil {
		return nil, err
	}

	payload, err := u.objectStorage.GetObject(ctx, asset.Bucket, asset.ObjectKey)
	if err != nil {
		return nil, err
	}

	return u.asr.Transcribe(ctx, asr.FilePayload{
		FileName:    asset.FileName,
		ContentType: asset.ContentType,
		Data:        payload,
	})
}
