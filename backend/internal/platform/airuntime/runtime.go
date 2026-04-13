package airuntime

import (
	"context"
	"fmt"
	"strings"
	"time"

	einoopenai "github.com/cloudwego/eino-ext/components/model/openai"
	einoadk "github.com/cloudwego/eino/adk"

	"github.com/chengjiang/aicook/backend/internal/conf"
	"github.com/chengjiang/aicook/backend/internal/platform/airuntime/audioinput"
	aircheckpoint "github.com/chengjiang/aicook/backend/internal/platform/airuntime/checkpoint"
)

type Runtime struct {
	mode                   Mode
	provider               *conf.AI
	mediaHostAllowlist     map[string]struct{}
	textModelName          string
	multimodalModelName    string
	textModel              *einoopenai.ChatModel
	multimodalModel        *einoopenai.ChatModel
	textModelErr           error
	multimodalModelErr     error
	knowledgeLookup        KnowledgeLookup
	knowledgeIngestManager KnowledgeIngestManager
	memoryWriter           MemoryWriter
	recipeLookup           RecipeLookup
	imageRecipeCreator     ImageRecipeCreator

	deepRootAgent       einoadk.ResumableAgent
	deepRunner          *einoadk.Runner
	deepCheckpointStore *aircheckpoint.MemoryStore
	adkErr              error
}

func New(cfg *conf.AI, oss *conf.OSS) *Runtime {
	mode := ModeADK
	if cfg != nil {
		mode = Mode(strings.ToLower(strings.TrimSpace(cfg.GetMode())))
	}
	if mode != ModeGraph {
		mode = ModeADK
	}

	runtime := &Runtime{
		mode:               mode,
		provider:           cfg,
		mediaHostAllowlist: audioinput.MediaHostAllowlist(oss),
	}
	if cfg == nil {
		runtime.initADK()
		return runtime
	}

	runtime.textModelName = strings.TrimSpace(cfg.GetChatModel())
	runtime.multimodalModelName = strings.TrimSpace(cfg.GetVisionModel())
	if runtime.multimodalModelName == "" {
		runtime.multimodalModelName = runtime.textModelName
	}
	if strings.TrimSpace(cfg.GetApiKey()) == "" {
		runtime.textModelErr = fmt.Errorf("ai api key is not configured")
		runtime.multimodalModelErr = runtime.textModelErr
		runtime.initADK()
		return runtime
	}

	runtime.textModel, runtime.textModelErr = newChatModel(cfg, runtime.textModelName)
	if runtime.multimodalModelName == runtime.textModelName {
		runtime.multimodalModel = runtime.textModel
		runtime.multimodalModelErr = runtime.textModelErr
	} else {
		runtime.multimodalModel, runtime.multimodalModelErr = newChatModel(cfg, runtime.multimodalModelName)
	}
	runtime.initADK()
	return runtime
}

func (r *Runtime) Mode() Mode {
	return r.mode
}

func newChatModel(cfg *conf.AI, modelName string) (*einoopenai.ChatModel, error) {
	modelName = strings.TrimSpace(modelName)
	if cfg == nil || strings.TrimSpace(cfg.GetApiKey()) == "" || modelName == "" {
		return nil, fmt.Errorf("chat model is not configured")
	}

	model, err := einoopenai.NewChatModel(context.Background(), &einoopenai.ChatModelConfig{
		APIKey:  strings.TrimSpace(cfg.GetApiKey()),
		BaseURL: resolveBaseURL(cfg),
		Model:   modelName,
		Timeout: 60 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("init model %s failed: %w", modelName, err)
	}
	return model, nil
}

func (r *Runtime) selectChatModel(useMultimodal bool) (*einoopenai.ChatModel, string, error) {
	if useMultimodal {
		if r.multimodalModel != nil {
			return r.multimodalModel, r.multimodalModelName, nil
		}
		if r.multimodalModelErr != nil {
			return nil, r.multimodalModelName, r.multimodalModelErr
		}
		if r.textModel != nil {
			return r.textModel, r.textModelName, nil
		}
		if r.textModelErr != nil {
			return nil, r.textModelName, r.textModelErr
		}
		return nil, r.multimodalModelName, fmt.Errorf("multimodal chat model is not configured")
	}
	if r.textModel != nil {
		return r.textModel, r.textModelName, nil
	}
	if r.textModelErr != nil {
		return nil, r.textModelName, r.textModelErr
	}
	if r.multimodalModel != nil {
		return r.multimodalModel, r.multimodalModelName, nil
	}
	if r.multimodalModelErr != nil {
		return nil, r.multimodalModelName, r.multimodalModelErr
	}
	return nil, r.textModelName, fmt.Errorf("chat model is not configured")
}

// hasRichInput selects the multimodal-capable model only for image/audio attachments.
// Documents (PDF 等) are inlined as text in the user message and must use the text model stack.
func hasRichInput(attachments []Attachment) bool {
	for _, attachment := range attachments {
		if strings.TrimSpace(attachment.URL) == "" {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(attachment.Type)) {
		case "image", "audio":
			return true
		}
	}
	return false
}

func hasImageAttachments(attachments []Attachment) bool {
	for _, attachment := range attachments {
		if strings.EqualFold(strings.TrimSpace(attachment.Type), "image") && strings.TrimSpace(attachment.URL) != "" {
			return true
		}
	}
	return false
}

func resolveBaseURL(cfg *conf.AI) string {
	baseURL := strings.TrimSpace(cfg.GetBaseUrl())
	if baseURL != "" {
		return baseURL
	}
	if strings.EqualFold(strings.TrimSpace(cfg.GetProvider()), "xiaomi") || strings.EqualFold(strings.TrimSpace(cfg.GetProvider()), "mimo") {
		return "https://api.xiaomimimo.com/v1"
	}
	return "https://api.xiaomimimo.com/v1"
}
