package ai

import (
	"context"

	"github.com/chengjiang/aicook/backend/internal/biz/user"
	"github.com/chengjiang/aicook/backend/internal/data"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime/audioinput"
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

	// 按字节嗅探真实格式：微信开发者工具/浏览器录的是 WebM 却标成 mp3，MiMo 只认 wav/mp3，
	// 直接送会报 "Format not recognised"。这里非 wav/mp3 的统一用 ffmpeg 转 WAV 再送。
	clean, mime, err := audioinput.EnsureMiMoAudio(ctx, payload)
	if err != nil {
		return nil, err
	}

	return u.asr.Transcribe(ctx, asr.FilePayload{
		FileName:    asset.FileName,
		ContentType: mime,
		Data:        clean,
	})
}
