# aicook-ai-workflow — extended reference

Optional detail for agents that need the same depth as `.codex/AGENTS.md` without Codex-specific tools.

## Phase 0 — context (expanded)

**Fast path**: very short, single-goal requests → still do a minimal scan (where code lives, one similar example).

**Structured scan** (output may go to `.codex/context-scan.json` if the team uses it):

- Where: module / directory / key files
- Current behavior: how it works today; 1–2 similar cases
- Stack: languages, frameworks, important deps
- Tests: where they live, how to run them
- Expert note: anomalies, missing info, what to read next

**Questions** (after scan):

- Known vs unknown vs priority (high/medium/low)

**Targeted deep dives** (optional, ≤3 recommended):

- One question at a time; cite code, not speculation
- Optional file: `.codex/context-question-N.json`

**Sufficiency before planning** (all should be “yes” or explicitly deferred):

- [ ] Interface contract clear (inputs, outputs, types, errors)
- [ ] Rationale for approach / alternatives understood
- [ ] Main risks (concurrency, bounds, performance) identified
- [ ] Verification path clear (commands, tests)

If not sufficient: one more targeted read, then proceed or ask the user.

## Phase 1 — planning

- Acceptance: API/shape, edge cases, performance if relevant, test expectations
- Dependencies: env, services, files, permissions
- Implementation notes: data flow, state, error handling

## Phase 2 — execution

- Small commits or logical steps; keep build green
- Track progress (todos); log major decisions in `.codex/operations-log.md` if used

## Phase 3 — review and test

**Self-review checklist** (lightweight):

- Requirements and scope match the ask
- Code style and patterns match surrounding code
- Tests/build run; failures explained

**Heavier review** (optional, from AGENTS.md):

- Technical score: quality, tests, conventions
- “Strategic” score: fit with architecture and risk
- Overall 0–100 and recommendation: pass / revise / redo
- Write-up in `.codex/review-report.md` for large or risky changes

**Tests**:

- Record commands and outcomes in `.codex/testing.md` or `verification.md` when the team expects audit trails
- Three failures on the same issue → pause and reassess

## Collaboration mantra (from AGENTS.md)

- Plan and decide; observe and judge; execute and verify; on doubt, decide or ask.
