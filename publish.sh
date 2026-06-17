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
REMOTE_HOST="${REMOTE_HOST:-root@sshjd.aihelper.chat}"
REMOTE_PORT="${REMOTE_PORT:-837}"
REMOTE_K8S_PATH="${REMOTE_K8S_PATH:-/root/k3s/aicook/aicook.yaml}"
SKIP_K8S_DEPLOY="${SKIP_K8S_DEPLOY:-false}"
# 要 apply 的 k8s 清单（默认仓库内 k8s-deployment.yaml；密钥已分离到 Secret，清单可安全 apply）。
K8S_MANIFEST="${K8S_MANIFEST:-}"
# UPDATE_SECRETS=1：部署前录入密钥并写入 k8s Secret aicook-secrets。
UPDATE_SECRETS="${UPDATE_SECRETS:-0}"
# SECRETS_FILE=路径：从文件读密钥（每行 KEY=value），复制粘贴友好；设了它就不走交互录入。
SECRETS_FILE="${SECRETS_FILE:-}"
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

SECRET_KEYS=(PG_PASSWORD REDIS_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY JWT_SECRET MIMO_API_KEY DOUBAO_API_KEY WX_SECRET)

is_secret_key() {
  local x
  for x in "${SECRET_KEYS[@]}"; do
    if [ "$x" = "$1" ]; then return 0; fi
  done
  return 1
}

# 把已拼好的 data JSON 片段写进 k8s Secret aicook-secrets（确保 ns/secret 存在，再 merge patch）。
# base64 值经 stdin 传给远程 kubectl（printf 是内建命令，明文不进进程列表）。
write_secrets() {
  local data="$1"
  if [ -z "${data}" ]; then echo "未提供任何密钥，跳过。"; return; fi
  ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" \
    "kubectl get namespace aicook >/dev/null 2>&1 || kubectl create namespace aicook"
  ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" \
    "kubectl get secret aicook-secrets -n aicook >/dev/null 2>&1 || kubectl create secret generic aicook-secrets -n aicook"
  printf '{"data":{%s}}' "${data}" | ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" \
    "kubectl patch secret aicook-secrets -n aicook --type=merge --patch-file=/dev/stdin"
  echo "✓ 已更新 Secret aicook-secrets"
}

# 从文件读密钥：每行 KEY=value，# 注释/空行忽略；去 CR/控制字符。
update_secrets_from_file() {
  local file="$1" data="" line k v b64
  while IFS= read -r line || [ -n "${line}" ]; do
    line="${line%$'\r'}"
    case "${line}" in ''|'#'*) continue ;; esac
    if [[ "${line}" != *"="* ]]; then continue; fi
    k=$(printf '%s' "${line%%=*}" | tr -d '[:space:]')
    v=$(printf '%s' "${line#*=}" | tr -d '[:cntrl:]')
    if ! is_secret_key "${k}"; then echo "  跳过未知键: ${k}"; continue; fi
    if [ -z "${v}" ]; then continue; fi
    b64=$(printf '%s' "${v}" | base64 | tr -d '\n')
    if [ -n "${data}" ]; then data+=","; fi
    data+="\"${k}\":\"${b64}\""
  done < "${file}"
  write_secrets "${data}"
}

update_secrets() {
  if [ -n "${SECRETS_FILE}" ]; then
    if [ ! -f "${SECRETS_FILE}" ]; then echo "找不到密钥文件: ${SECRETS_FILE}"; exit 1; fi
    echo "从文件读取密钥: ${SECRETS_FILE}"
    update_secrets_from_file "${SECRETS_FILE}"
    return
  fi
  echo "逐项录入密钥（直接回车=跳过）。注意：粘贴易出错，复制粘贴请用 SECRETS_FILE=xxx ./publish.sh backend"
  local prompts=("PostgreSQL 密码" "Redis 密码" "MinIO Access Key" "MinIO Secret Key" "JWT 签名密钥" "MiMo API Key（ai.api_key）" "Doubao 向量 API Key" "微信小程序 AppSecret")
  local data="" i val b64
  for i in "${!SECRET_KEYS[@]}"; do
    read -r -s -p "  ${prompts[$i]}  [${SECRET_KEYS[$i]}]: " val
    echo
    val=$(printf '%s' "${val}" | tr -d '[:cntrl:]')
    if [ -z "${val}" ]; then continue; fi
    b64=$(printf '%s' "${val}" | base64 | tr -d '\n')
    if [ -n "${data}" ]; then data+=","; fi
    data+="\"${SECRET_KEYS[$i]}\":\"${b64}\""
  done
  write_secrets "${data}"
}

deploy_k8s_manifest() {
  if [ "${SKIP_K8S_DEPLOY}" = "true" ]; then
    echo "跳过 k8s 清单同步"
    return
  fi

  # 密钥已分离到 k8s Secret（见 update_secrets），仓库内清单只含 ${VAR} 占位，可安全 apply。
  local manifest="${K8S_MANIFEST:-${ROOT_DIR}/k8s-deployment.yaml}"
  local image="${DOCKERHUB_USER}/aicook-backend"

  # 预检：Secret 必须存在，否则新 Pod 会 CreateContainerConfigError。
  if ! ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" "kubectl get secret aicook-secrets -n aicook >/dev/null 2>&1"; then
    echo "远程缺少 Secret aicook-secrets：首次部署请先 UPDATE_SECRETS=1 ./publish.sh backend 录入密钥。"
    exit 1
  fi

  # 把后端镜像版本写进清单（让仓库 yaml 跟踪当前部署版本），再整体 apply（tag 变更触发滚动更新）。
  sed -i "s|${image}:[^[:space:]\"]*|${image}:${VERSION_BACKEND}|g" "${manifest}"

  echo "同步 k8s 清单到远程（端口 ${REMOTE_PORT}）: ${manifest} → ${image}:${VERSION_BACKEND}"
  rsync -avz -e "ssh -p ${REMOTE_PORT}" "${manifest}" "${REMOTE_HOST}:${REMOTE_K8S_PATH}"
  ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" "kubectl apply -f ${REMOTE_K8S_PATH}"

  # 镜像 tag 变了 apply 已触发滚动；仅改密钥（spec 不变）时需显式重启加载新 env。
  if [ "${UPDATE_SECRETS}" = "1" ]; then
    ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" "kubectl rollout restart deployment/backend -n aicook"
  fi
  ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" "kubectl rollout status deployment/backend -n aicook --timeout=180s"
}

if [ -z "${SERVICE}" ] || [ "${SERVICE}" = "backend" ]; then
  build_and_push "backend" "${ROOT_DIR}/backend" "${ROOT_DIR}/backend/Dockerfile" "${VERSION_BACKEND}"
fi

if [ -z "${SERVICE}" ] || [ "${SERVICE}" = "frontend" ]; then
  build_frontend_dist
  build_and_push "frontend" "${ROOT_DIR}/frontend" "${ROOT_DIR}/frontend/Dockerfile" "${VERSION_FRONTEND}"
fi

if [ "${UPDATE_SECRETS}" = "1" ]; then
  update_secrets
  if [ "${SKIP_K8S_DEPLOY}" = "true" ]; then
    echo "已更新 Secret 但 SKIP_K8S_DEPLOY=true：滚动重启以让新密钥生效。"
    ssh -p "${REMOTE_PORT}" "${REMOTE_HOST}" "kubectl rollout restart deployment/backend -n aicook"
  fi
fi

deploy_k8s_manifest

echo "发布完成"
