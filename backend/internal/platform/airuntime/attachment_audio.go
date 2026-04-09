package airuntime

import (
	"context"

	"github.com/cloudwego/eino/schema"

	"github.com/chengjiang/aicook/backend/internal/platform/airuntime/audioinput"
)

// buildAudioInputPart 只保留 Runtime 侧薄封装，真实音频拉取与转码逻辑下沉到 audioinput 子目录。
func (r *Runtime) buildAudioInputPart(ctx context.Context, attachment Attachment) (schema.MessageInputPart, error) {
	return audioinput.BuildInputPart(ctx, attachment.URL, attachment.ContentType, r.mediaHostAllowlist)
}
