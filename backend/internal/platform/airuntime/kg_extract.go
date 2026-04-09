package airuntime

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

// GenerateKnowledgeGraphTriplesJSON 调用文本模型，从摘录中抽取知识图谱三元组，返回 JSON 数组字符串。
func (r *Runtime) GenerateKnowledgeGraphTriplesJSON(ctx context.Context, docTitle, textExcerpt string) (string, error) {
	textExcerpt = strings.TrimSpace(textExcerpt)
	if textExcerpt == "" {
		return "[]", nil
	}
	model, _, err := r.selectChatModel(false)
	if err != nil {
		return "", err
	}
	callCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	schemaHelp := `只输出一个 JSON 数组，不要 Markdown，不要解释。每个元素字段：
subject_kind: dish|ingredient|flavor|pairing|document 之一
subject_id: 小写简洁 id，如 dish:宫保鸡丁、ingredient:花生
predicate: 英文蛇形，如 contains_ingredient、pairs_with、similar_to、documented_in、suitable_for_flavor、mentions
object_kind: 同上枚举
object_id: 小写简洁 id
weight: 可选 0.5～2 的数字，省略则为 1

示例：[{"subject_kind":"dish","subject_id":"dish:红烧肉","predicate":"contains_ingredient","object_kind":"ingredient","object_id":"ingredient:五花肉","weight":1}]`

	user := strings.Builder{}
	user.WriteString("文档标题: ")
	user.WriteString(strings.TrimSpace(docTitle))
	user.WriteString("\n\n正文摘录:\n")
	user.WriteString(textExcerpt)

	msg, err := r.generateMessage(callCtx, model, []*schema.Message{
		{
			Role:    schema.System,
			Content: "你是中餐知识图谱抽取助手，从用户提供的菜谱/食疗文本中提取实体与关系，输出合法 JSON。" + schemaHelp,
		},
		{
			Role:    schema.User,
			Content: user.String(),
		},
	}, einomodel.WithTemperature(0.1))
	if err != nil {
		return "", err
	}
	return normalizeJSONArrayResponse(msg.Content), nil
}

func normalizeJSONArrayResponse(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "[]"
	}
	// 去掉 ```json ... ``` 包裹
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimPrefix(s, "json")
		s = strings.TrimSpace(s)
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = strings.TrimSpace(s[:idx])
		}
	}
	if !strings.HasPrefix(s, "[") {
		if i := strings.Index(s, "["); i >= 0 {
			if j := strings.LastIndex(s, "]"); j > i {
				s = s[i : j+1]
			}
		}
	}
	return s
}

// KnowledgeGraphTriple 与 LLM JSON 对齐。
type KnowledgeGraphTriple struct {
	SubjectKind  string  `json:"subject_kind"`
	SubjectID    string  `json:"subject_id"`
	Predicate    string  `json:"predicate"`
	ObjectKind   string  `json:"object_kind"`
	ObjectID     string  `json:"object_id"`
	Weight       float64 `json:"weight"`
}

func ParseKnowledgeGraphTriplesJSON(raw string) ([]KnowledgeGraphTriple, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" {
		return nil, nil
	}
	var items []KnowledgeGraphTriple
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, err
	}
	return items, nil
}
