#!/bin/bash
###
 # @Author: chengjiang
 # @Date: 2026-03-24
 # @Description: 先本地构建 dist，再构建前端 Docker 镜像，可选推送到仓库。
###

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
IMAGE_REPO="${IMAGE_REPO:-7as0nch/aicook-frontend}"
IMAGE_TAG="${IMAGE_TAG:-local}"
PLATFORM="${PLATFORM:-linux/amd64}"
PUSH_IMAGE="${PUSH_IMAGE:-false}"

cd "${SCRIPT_DIR}"

echo "安装前端依赖"
pnpm install

echo "本地构建前端 dist"
pnpm build

if [ ! -d "${SCRIPT_DIR}/dist" ]; then
  echo "dist 目录不存在，前端构建失败"
  exit 1
fi

echo "开始构建 frontend 镜像: ${IMAGE_REPO}:${IMAGE_TAG}"
docker buildx build \
  --platform "${PLATFORM}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${IMAGE_REPO}:${IMAGE_TAG}" \
  "${SCRIPT_DIR}" \
  $( [ "${PUSH_IMAGE}" = "true" ] && echo "--push" || echo "--load" )

echo "frontend 镜像构建完成: ${IMAGE_REPO}:${IMAGE_TAG}"
