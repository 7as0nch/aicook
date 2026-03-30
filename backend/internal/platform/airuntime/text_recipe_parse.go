package airuntime

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

func parseTextRecipeDraftJSON(raw string) (*TextRecipeDraft, error) {
	body := strings.TrimSpace(raw)
	if !json.Valid([]byte(body)) {
		re := regexp.MustCompile(`(?s)\{.*\}`)
		body = re.FindString(body)
	}
	if !json.Valid([]byte(body)) {
		return nil, fmt.Errorf("text recipe draft response is not valid json")
	}
	var draft TextRecipeDraft
	if err := json.Unmarshal([]byte(body), &draft); err != nil {
		return nil, err
	}
	return &draft, nil
}
