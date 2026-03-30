#!/bin/bash
###
 # @Author: chengjiang
 # @Date: 2026-03-24
 # @Description: AICook 发布脚本。前端会先本地生成 dist，再推送 Docker 镜像。
###

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DOCKERHUB_USER="${DOCKERHUB_USER:-7as0nch}"
PLATFORM="${PLATFORM:-linux/amd64}"
VERSION_BACKEND="${VERSION_BACKEND:-v0.1.0}"
VERSION_FRONTEND="${VERSION_FRONTEND:-v0.1.0}"
VERSION_INFERENCE="${VERSION_INFERENCE:-v0.1.0}"
REMOTE_HOST="${REMOTE_HOST:-root@sshjd.aihelper.chat}"
REMOTE_K8S_PATH="${REMOTE_K8S_PATH:-/root/k3s/aicook/aicook.yaml}"
SKIP_K8S_DEPLOY="${SKIP_K8S_DEPLOY:-false}"
SERVICE="${1:-}"

build_and_push() {
  local name=$1
  local context=$2
  local dockerfile=$3
  local version=$4

  echo "构建并推送 ${name}:${version}"
  docker buildx build \
    --platform "${PLATFORM}" \
    -t "${DOCKERHUB_USER}/aicook-${name}:${version}" \
    -t "${DOCKERHUB_USER}/aicook-${name}:latest" \
    -f "${dockerfile}" \
    "${context}" \
    --push
}

build_frontend_dist() {
  echo "本地构建 frontend dist"
  (
    cd "${ROOT_DIR}/frontend"
    pnpm install
    pnpm build
  )

  if [ ! -d "${ROOT_DIR}/frontend/dist" ]; then
    echo "frontend dist 构建失败，未找到 dist 目录"
    exit 1
  fi
}

deploy_k8s_manifest() {
  if [ "${SKIP_K8S_DEPLOY}" = "true" ]; then
    echo "跳过 k8s 清单同步"
    return
  fi

  echo "同步 k8s 清单到远程服务器"
  rsync -avz "${ROOT_DIR}/k8s-deployment.yaml" "${REMOTE_HOST}:${REMOTE_K8S_PATH}"
  ssh "${REMOTE_HOST}" "kubectl apply -f ${REMOTE_K8S_PATH}"
}

if [ -z "${SERVICE}" ] || [ "${SERVICE}" = "backend" ]; then
  build_and_push "backend" "${ROOT_DIR}/backend" "${ROOT_DIR}/backend/Dockerfile" "${VERSION_BACKEND}"
fi

if [ -z "${SERVICE}" ] || [ "${SERVICE}" = "frontend" ]; then
  build_frontend_dist
  build_and_push "frontend" "${ROOT_DIR}/frontend" "${ROOT_DIR}/frontend/Dockerfile" "${VERSION_FRONTEND}"
fi

if [ -z "${SERVICE}" ] || [ "${SERVICE}" = "inference" ]; then
  build_and_push "inference" "${ROOT_DIR}/inference-service" "${ROOT_DIR}/inference-service/Dockerfile" "${VERSION_INFERENCE}"
fi

deploy_k8s_manifest

echo "发布完成"
