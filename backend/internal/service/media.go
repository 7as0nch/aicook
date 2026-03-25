package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz"
)

type MediaService struct {
	v1.UnimplementedMediaServiceServer

	usecase *biz.MediaUsecase
}

func NewMediaService(usecase *biz.MediaUsecase) *MediaService {
	return &MediaService{usecase: usecase}
}

func (s *MediaService) PrepareMediaUpload(ctx context.Context, req *v1.PrepareMediaUploadRequest) (*v1.PrepareMediaUploadReply, error) {
	actor := biz.ActorFromContext(ctx)
	result, err := s.usecase.PrepareUpload(ctx, biz.PrepareUploadRequest{
		HouseholdID: actor.HouseholdID,
		UserID:      actor.UserID,
		MediaKind:   req.GetMediaKind(),
		FileName:    req.GetFileName(),
		ContentType: req.GetContentType(),
		SizeBytes:   req.GetSizeBytes(),
	})
	if err != nil {
		return nil, err
	}

	headers := make([]*v1.UploadHeader, 0, len(result.UploadHeaders))
	for key, value := range result.UploadHeaders {
		headers = append(headers, &v1.UploadHeader{Key: key, Value: value})
	}
	return &v1.PrepareMediaUploadReply{
		AssetId:       result.Asset.ID,
		ObjectKey:     result.ObjectKey,
		UploadUrl:     result.UploadURL,
		UploadHeaders: headers,
	}, nil
}

func (s *MediaService) CompleteMediaUpload(ctx context.Context, req *v1.CompleteMediaUploadRequest) (*v1.CompleteMediaUploadReply, error) {
	asset, err := s.usecase.CompleteUpload(ctx, req.GetAssetId())
	if err != nil {
		return nil, err
	}
	return &v1.CompleteMediaUploadReply{Asset: toProtoMediaAsset(asset)}, nil
}
