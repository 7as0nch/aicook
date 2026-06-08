# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AICook is an AI-powered recipe management app (Chinese-language). Users upload recipes, get daily recommendations, and receive AI-assisted cooking guidance. The repo is a monorepo with three independent services plus a WeChat mini-program.

## Repository Layout

```
backend/          Go monolith (Kratos v2 + Eino AI framework)
frontend/         React SPA (Vite + Tailwind + Capacitor for mobile)
inference-service/  Python FastAPI service (speech recognition + OCR)
wx/               WeChat mini-program
deploy/sql/       Database migrations and seed data
```

## Build & Run Commands

### Backend (Go)

```bash
# Build (from repo root)
cd backend && go build ./cmd/backend/

# Run (needs config — see below)
AICOOK_CONFIG=./configs/config.yaml go run ./cmd/backend/

# Regenerate Wire dependency injection
cd backend/cmd/backend && wire

# Run tests
cd backend && go test ./...

# Run a single test
cd backend && go test ./internal/biz/ -run TestKnowledge

# Generate protobuf code (requires protoc + kratos CLI)
# Proto files live in backend/api/aicook/v1/*.proto
```

### Frontend (React)

```bash
cd frontend

# Install dependencies
pnpm install

# Dev server
pnpm dev

# Production build
pnpm build

# Preview built app
pnpm preview
```

### Inference Service (Python)

```bash
cd inference-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8088
```

### Docker

```bash
# Build backend image
cd backend && ./build-local-docker-image.sh

# Full build + deploy package
cd backend && ./build_and_package.sh
```

## Architecture

### Backend Layering (Kratos pattern)

```
service/   →  HTTP/gRPC handlers (thin, delegates to biz)
biz/       →  Business logic and domain interfaces
data/      →  Repository implementations (PostgreSQL, Redis)
platform/  →  Infrastructure adapters (AI, storage, cache, embeddings)
model/     →  GORM database models
conf/      →  Configuration loading
server/    →  HTTP/gRPC server wiring and middleware
auth/      →  JWT authentication middleware
```

Wire (Google Wire) is used for compile-time dependency injection. Entry point: `backend/cmd/backend/main.go`, generated code in `wire_gen.go`.

### API Layer

Protocol Buffers define the API in `backend/api/aicook/v1/`. Kratos generates both HTTP and gRPC handlers. Services: AI, Auth, Recipe, Cooking, Kitchen, Knowledge, Media, Voice, Import, Household.

### AI Integration

- **Eino framework** (ByteDance/CloudWeGo) for AI orchestration with ADK and Graph modes
- **AI provider**: Xiaomi MiMo (OpenAI-compatible API)
- **Embeddings**: Doubao multimodal embeddings (2048 dimensions), stored in PostgreSQL via pgvector
- AI runtime code is in `backend/internal/platform/airuntime/`

### Frontend Structure

Feature-based organization under `frontend/src/features/` (cooking, home, knowledge, plan, profile, recipes, shopping). State management: Zustand with browser persistence. UI: Radix UI + Ant Design X + Tailwind CSS. Mobile: Capacitor for iOS/Android builds.

### Inference Service

Lightweight Python service for heavy ML tasks the Go backend delegates:
- **FunASR**: Automatic speech recognition
- **PaddleOCR**: Image text extraction (recipe parsing)

## Configuration

Backend config: `backend/configs/config.yaml` (or set `AICOOK_CONFIG` env var).

Key services the backend depends on:
- **PostgreSQL** (schema: `aicook`) with pgvector extension
- **Redis** for caching
- **MinIO** for object storage (buckets: `aicook-media`, `aicook-kb`)
- **Inference service** at port 8088

## Database

Migrations in `deploy/sql/`. Key files:
- `base.sql` — schema creation
- `seed_demo_recipes.sql` — demo recipe data
- `seed_kitchen_tags.sql` — kitchen tag presets

The schema uses pgvector for embedding storage and JSONB columns for flexible recipe data.

## Deployment

Kubernetes manifests in `k8s-deployment.yaml` (namespace: `aicook`). Docker multi-stage builds: `golang:1.25` → `alpine`. Backend ports: 8000 (HTTP), 9000 (gRPC).

## Language

All user-facing strings, comments, and documentation are in Chinese (Simplified). Commit messages use Chinese with bracketed prefixes like `[new]`, `[better]`.
