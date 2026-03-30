package graph

import (
	"context"
	"strings"

	"github.com/cloudwego/eino/compose"
)

func appendStep(ctx context.Context, onStep func(context.Context, Step), step Step) {
	_ = compose.ProcessState[*state](ctx, func(_ context.Context, s *state) error {
		s.steps = append(s.steps, step)
		return nil
	})
	if onStep != nil {
		onStep(ctx, step)
	}
}

func defaultRejectHint(hint string) string {
	hint = strings.TrimSpace(hint)
	if hint == "" {
		return "image is not a complete recipe flow"
	}
	return hint
}

func ternary(ok bool, yes, no string) string {
	if ok {
		return yes
	}
	return no
}
