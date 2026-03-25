#!/bin/bash
###
 # @Author: chengjiang
 # @Date: 2026-03-24
 # @Description: 构建 backend 镜像，并导出为本地部署包。
###

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
IMAGE_REPO="${IMAGE_REPO:-aicook-backend}"
IMAGE_TAG="${IMAGE_TAG:-local}"
PACKAGE_DIR="${SCRIPT_DIR}/deploy"

"${SCRIPT_DIR}/build-local-docker-image.sh"

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

docker save -o "${PACKAGE_DIR}/${IMAGE_REPO}.tar" "${IMAGE_REPO}:${IMAGE_TAG}"
cp "${SCRIPT_DIR}/docker-compose.yml" "${PACKAGE_DIR}/docker-compose.yml"
cp "${SCRIPT_DIR}/configs/config.yaml" "${PACKAGE_DIR}/config.yaml"

tar -czf "${SCRIPT_DIR}/${IMAGE_REPO}-deploy.tar.gz" -C "${SCRIPT_DIR}" deploy
rm -rf "${PACKAGE_DIR}"

echo "backend 部署包已生成: ${SCRIPT_DIR}/${IMAGE_REPO}-deploy.tar.gz"
