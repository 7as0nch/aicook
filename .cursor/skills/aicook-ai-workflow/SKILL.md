---
name: aicook-ai-workflow
description: >-
  Guides any AI assistant working on the aicook monorepo (Go backend, React
  frontend, aidesign): phased context gathering, implementation, verification,
  artifact paths, and coding conventions aligned with project AGENTS.md. Use when
  implementing features, fixing bugs, refactoring, testing, or reviewing changes
  in this repository or when the user mentions aicook, .codex workflows, or
  project agent rules.
---

# aicook — AI workflow (Cursor)

This skill adapts [AGENTS.md](../../../.codex/AGENTS.md) for **Cursor** and **any** model: same intent and priorities, without Codex-only tools.

## Quick rules (priority order)

1. Prefer **standard libraries, official SDKs, and mainstream ecosystem**; avoid new bespoke frameworks or extra internal abstractions. Migrate or remove redundant custom stacks when touched.
2. **Subdirectory wins**: if a path has its own `AGENTS.md`, follow it first, then this skill, then repo docs.
3. **Verification**: run checks **locally** (agent runs tests/commands in the workspace). Do not assume CI or external reviewers unless the user asks.
4. **Security** (project policy from AGENTS.md): security is lowest priority; **do not add** security features or hardening unless the user **explicitly** requests it. If the user did not ask for security work, do not introduce new security designs; align changes with existing AGENTS.md when in doubt.
5. **Evidence**: prefer conclusions backed by **code or file reads** over guesses.

## Cursor tool mapping (replaces Codex-specific tools)

| Intent (AGENTS.md) | In Cursor use |
| --- | --- |
| Deep / sequential thinking | Reason step-by-step in the reply; use an explicit short plan before large edits. |
| Task planning (`shrimp-task-manager`, etc.) | **Todo** list / checklist in tools; break complex work into tracked steps. |
| Patch edits (`apply_patch`) | Apply focused edits (search_replace / multi-file edit); keep diffs small and reviewable. |
| Read codebase (`code-index`) | **Semantic search**, **grep**, **read_file** on relevant paths. |
| Web search (`exa`, etc.) | **Web search** or user-approved fetch when facts are missing. |
| Shell | **Terminal** commands the user’s environment allows. |
| Image / UI | Attach screenshots or use image-capable flows when the user provides them. |

MCP servers: use whatever is enabled in the user’s Cursor config; if a named tool is missing, note the fallback in `.codex/operations-log.md` (optional) and continue with native tools.

## Workflow (four phases — same spirit as AGENTS.md)

- **Phase 0 — Context**: Before big changes, locate modules/files, find 1–2 similar implementations, note stack and how tests run. For complex asks, capture a short structured summary (optional: `.codex/structured-request.json`). See [reference.md](reference.md) for the full context checklist and “sufficiency” gates.
- **Phase 1 — Plan**: Define acceptance (inputs/outputs, errors, how to verify). Confirm dependencies and files exist.
- **Phase 2 — Implement**: Small steps; keep the tree **buildable** after each meaningful chunk; match existing style; **comments and doc notes in Chinese** where the project already does (per AGENTS.md).
- **Phase 3 — Verify**: Run project tests/build/lint as appropriate; record failures and fixes. Optional artifacts: `.codex/testing.md`, `verification.md`, `.codex/review-report.md` for substantial tasks.

Phase boundaries are **flexible**: you may loop back to context or plan when you discover gaps; log notable pivots in `.codex/operations-log.md` when the team uses that file.

## Coding conventions (summary)

- Fix bugs before adding unrelated features when both appear in scope.
- **SOLID**, match language and repo style; no placeholder/MVP stubs—deliver working code.
- Prefer **simple, readable** code; avoid clever tricks; abstract only after **repeated** patterns (e.g. third occurrence rule from AGENTS.md).
- When integrating: study **several** similar features, reuse libraries and test patterns already in the repo; use the **existing** build and test commands (do not invent new build scripts unless the user asks).
- Breaking changes are acceptable when aligned with product direction; remove dead code you touch.

## Testing

- Add or update tests when the repo already uses them for that area; run them locally.
- After **three** failed attempts at the same fix, **stop**, summarize, and ask the user or change strategy.

## When to ask the user (exceptions)

Ask before:

- Deleting or replacing core config (`package.json`, `tsconfig`, `.env`, etc.).
- Destructive DB migrations (`DROP`, incompatible `ALTER`, etc.).
- **`git push`** (especially default branch).
- Same error **three** times in a row without progress.
- Anything the user said requires confirmation.

Otherwise prefer **acting**, then correcting if needed.

## Work artifacts (optional team hygiene)

If the team maintains `.codex/` logs, prefer **project** paths only:

- Context / structured request: `.codex/context-scan.json`, `.codex/context-question-N.json`, `.codex/structured-request.json`
- Logs / review: `.codex/operations-log.md`, `.codex/review-report.md`, `.codex/testing.md`, `verification.md`

Do not write agent state under a user home `~/.codex/` for this repo.

## Full detail

For the original long-form tables (tool lists, scoring rubric, forbidden skips), read [AGENTS.md](../../../.codex/AGENTS.md) and [reference.md](reference.md).
