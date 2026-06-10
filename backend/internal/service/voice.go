package service

import (
	"context"

	v1 "github.com/chengjiang/aicook/backend/api/aicook/v1"
	"github.com/chengjiang/aicook/backend/internal/biz/ai"
)

type VoiceService struct {
	v1.UnimplementedVoiceServiceServer

	usecase *ai.VoiceUsecase
}

func NewVoiceService(usecase *ai.VoiceUsecase) *VoiceService {
	return &VoiceService{usecase: usecase}
}

func (s *VoiceService) Transcribe(ctx context.Context, req *v1.TranscribeRequest) (*v1.TranscribeReply, error) {
	result, err := s.usecase.TranscribeAsset(ctx, req.GetAssetId())
	if err != nil {
		return nil, err
	}

	segments := make([]*v1.SpeechSegment, 0, len(result.Segments))
	for _, item := range result.Segments {
		segments = append(segments, &v1.SpeechSegment{
			StartMs: item.StartMS,
			EndMs:   item.EndMS,
			Text:    item.Text,
			Score:   item.Score,
		})
	}
	return &v1.TranscribeReply{
		Text:       result.Text,
		Confidence: result.Confidence,
		Segments:   segments,
	}, nil
}
