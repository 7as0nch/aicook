package airuntime

import (
	"context"
	"strings"

	"github.com/cloudwego/eino/schema"

	"github.com/chengjiang/aicook/backend/internal/platform/airuntime/imageinput"
)

// buildImageInputPart 把单张图片附件拉取并 base64 内联（与语音同一套思路）：
// 不能把内网/HTTP 的 MinIO URL 直接交给 MiMo 云端拉取，否则 400 Param Incorrect。
func (r *Runtime) buildImageInputPart(ctx context.Context, attachment Attachment) (schema.MessageInputPart, error) {
	return imageinput.BuildInputPart(ctx, attachment.URL, attachment.ContentType, r.mediaHostAllowlist)
}

// resolveImageDraftParts 把图片附件批量解析为 base64 内联的多模态 part（跳过空 URL）。
func (r *Runtime) resolveImageDraftParts(ctx context.Context, images []Attachment) ([]schema.MessageInputPart, error) {
	parts := make([]schema.MessageInputPart, 0, len(images))
	for _, img := range images {
		if strings.TrimSpace(img.URL) == "" {
			continue
		}
		part, err := r.buildImageInputPart(ctx, img)
		if err != nil {
			return nil, err
		}
		parts = append(parts, part)
	}
	return parts, nil
}
