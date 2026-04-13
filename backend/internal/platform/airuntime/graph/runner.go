package graph

import "context"

type state struct {
	steps []Step
}

type runnerConfig struct {
	onStep func(context.Context, Step)
}

type Option func(*runnerConfig)

func WithStepObserver(fn func(context.Context, Step)) Option {
	return func(cfg *runnerConfig) {
		cfg.onStep = fn
	}
}
