#!/bin/bash
###
 # @Author: chengjiang
 # @Date: 2026-03-24
 # @Description: 本地构建 AICook backend Docker 镜像，可选推送到仓库。
###

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
IMAGE_REPO="${IMAGE_REPO:-7as0nch/aicook-backend}"
IMAGE_TAG="${IMAGE_TAG:-local}"
PLATFORM="${PLATFORM:-linux/amd64}"
PUSH_IMAGE="${PUSH_IMAGE:-false}"

echo "开始构建 backend 镜像: ${IMAGE_REPO}:${IMAGE_TAG}"
docker buildx build \
  --platform "${PLATFORM}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${IMAGE_REPO}:${IMAGE_TAG}" \
  "${SCRIPT_DIR}" \
  $( [ "${PUSH_IMAGE}" = "true" ] && echo "--push" || echo "--load" )

echo "backend 镜像构建完成: ${IMAGE_REPO}:${IMAGE_TAG}"
