#!/bin/bash
###
 # @Author: chengjiang
 # @Description: AICook 后端发布脚本（macOS / Linux / WSL bash）。与 publish.ps1 等价：只发 backend——
 #   构建并推送指定版本镜像，把版本号写进 k8s 清单并整体 apply。密钥单独走 k8s Secret（UPDATE_SECRETS=1，默认跳过）。
 #
 # 流程：
 #   1) 本机 daemon `docker build` 构建 linux/amd64 镜像（走 daemon.json 的 registry-mirrors，国内可达）再 `docker push`
 #      （tag = VERSION_BACKEND，外加 :latest）；不用容器型 buildx builder——它不继承镜像加速，国内拉基础镜像会卡死；
 #   2) 把版本号写进 k8s-deployment.yaml 的后端镜像 tag，再 `kubectl apply -f -`（经 ssh stdin，无需 rsync）；
 #   3) kubectl rollout status 等待就绪 + /health 冒烟。
 #
 # 密钥不在 ConfigMap：ConfigMap 用 ${VAR} 占位，真实密钥在 k8s Secret aicook-secrets，由 UPDATE_SECRETS=1
 # 交互录入（或 SECRETS_FILE=xxx 从文件读）。首次部署需先 UPDATE_SECRETS=1 建 Secret，否则 Pod 会
 # CreateContainerConfigError（脚本部署前会预检 Secret 是否存在）。
 #
 # 示例：
 #   ./publish.sh                                                  # 日常发版：打包 VERSION_BACKEND → 写进清单 → apply
 #   VERSION_BACKEND=v1.0.6 ./publish.sh                           # 指定版本发版
 #   SKIP_BUILD=1 VERSION_BACKEND=v1.0.6 ./publish.sh              # 镜像已推送，只更新清单版本并 apply
 #   SKIP_DEPLOY=1 ./publish.sh                                    # 只构建 + 推送镜像，不部署
 #   UPDATE_SECRETS=1 ./publish.sh                                 # 逐项隐藏录入密钥，再部署
 #   UPDATE_SECRETS=1 SECRETS_FILE=./secrets.env SKIP_BUILD=1 ./publish.sh   # 从文件读密钥（复制粘贴推荐用这个）
 #
 # 前置：已 docker login；本机有 docker / ssh / curl；SSH 公钥已加到远程（端口 REMOTE_PORT，首次连接需接受 host key）。
###

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DOCKERHUB_USER="${DOCKERHUB_USER:-7as0nch}"
VERSION_BACKEND="${VERSION_BACKEND:-v0.1.7}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"
REMOTE_HOST="${REMOTE_HOST:-root@sshjd.aihelper.chat}"
REMOTE_PORT="${REMOTE_PORT:-22}"
NAMESPACE="${NAMESPACE:-aicook}"
API_HOST="${API_HOST:-aicookapi.aihelper.chat}"
ROLLOUT_TIMEOUT_SEC="${ROLLOUT_TIMEOUT_SEC:-180}"
# 要 apply 的 k8s 清单（默认仓库内 k8s-deployment.yaml；密钥已分离到 Secret，清单可安全 apply）。
K8S_MANIFEST="${K8S_MANIFEST:-${ROOT_DIR}/k8s-deployment.yaml}"
# UPDATE_SECRETS=1：部署前录入密钥并写入 k8s Secret aicook-secrets。
UPDATE_SECRETS="${UPDATE_SECRETS:-0}"
# SECRETS_FILE=路径：从文件读密钥（每行 KEY=value），复制粘贴友好；设了它就不走交互录入。
SECRETS_FILE="${SECRETS_FILE:-}"
# 开关（接受 1/true/yes/y/on）：SKIP_BUILD 跳过构建推送；SKIP_DEPLOY 只构建不部署；NO_SMOKE 跳过冒烟。
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
NO_SMOKE="${NO_SMOKE:-0}"

IMAGE="${DOCKERHUB_USER}/aicook-backend"
# 复用的 ssh 参数：-T 不分配 tty；ConnectTimeout 避免网络问题时无限挂起。
SSH_ARGS=(-T -o ConnectTimeout=10 -p "${REMOTE_PORT}" "${REMOTE_HOST}")

# 本脚本已改为只发 backend（与 publish.ps1 一致）。误传 frontend 时给出提示，避免“以为发了前端”。
if [ "${1:-}" = "frontend" ]; then
  echo "注意：本脚本已改为只发 backend（与 publish.ps1 一致），忽略 'frontend' 参数。" >&2
fi

is_true() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | y | on) return 0 ;;
    *) return 1 ;;
  esac
}

# 在本机 docker daemon 上构建再 push，而非用容器型 buildx builder。
# 原因（国内网络）：容器型 builder（docker-container 驱动）有独立 BuildKit，【不继承】daemon.json 的
# registry-mirrors，会直连 docker.io —— 实测要么 auth.docker.io TLS 握手超时，要么 manifest 能拉但
# blob 卡在 0B。而本机 daemon 会走 registry-mirrors，基础镜像秒级拉取。daemon 用 overlay2（非
# containerd 镜像库）时 buildx 的 docker 驱动不支持 --push，所以这里用经典 `docker build` + `docker push` 两步。
# 注：push 是推到自己仓库（docker.io，镜像加速器只加速「拉」不加速「推」）；需已 docker login。
build_and_push_backend() {
  echo "构建 ${IMAGE}:${VERSION_BACKEND} / ${IMAGE}:${IMAGE_TAG}（${PLATFORM}，走本机 daemon + registry-mirrors）"
  docker build \
    --platform "${PLATFORM}" \
    -t "${IMAGE}:${VERSION_BACKEND}" \
    -t "${IMAGE}:${IMAGE_TAG}" \
    -f "${ROOT_DIR}/backend/Dockerfile" \
    "${ROOT_DIR}/backend"

  echo "推送 ${IMAGE}:${VERSION_BACKEND} 与 ${IMAGE}:${IMAGE_TAG}"
  docker push "${IMAGE}:${VERSION_BACKEND}"
  docker push "${IMAGE}:${IMAGE_TAG}"
}

# 8 个密钥键（顺序固定）。
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
  ssh "${SSH_ARGS[@]}" \
    "kubectl get namespace ${NAMESPACE} >/dev/null 2>&1 || kubectl create namespace ${NAMESPACE}"
  ssh "${SSH_ARGS[@]}" \
    "kubectl get secret aicook-secrets -n ${NAMESPACE} >/dev/null 2>&1 || kubectl create secret generic aicook-secrets -n ${NAMESPACE}"
  printf '{"data":{%s}}' "${data}" | ssh "${SSH_ARGS[@]}" \
    "kubectl patch secret aicook-secrets -n ${NAMESPACE} --type=merge --patch-file=/dev/stdin"
  echo "✓ 已更新 Secret aicook-secrets"
}

# 从文件读密钥：每行 KEY=value，# 注释/空行忽略；去 CR/控制字符。
update_secrets_from_file() {
  local file="$1" data="" line k v b64
  while IFS= read -r line || [ -n "${line}" ]; do
    line="${line%$'\r'}"
    case "${line}" in '' | '#'*) continue ;; esac
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
  echo "逐项录入密钥（直接回车=跳过）。注意：粘贴易出错，复制粘贴请用 SECRETS_FILE=xxx ./publish.sh"
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

deploy_backend() {
  # 预检：Secret 必须存在，否则新 Pod 会 CreateContainerConfigError。
  if ! ssh "${SSH_ARGS[@]}" "kubectl get secret aicook-secrets -n ${NAMESPACE} >/dev/null 2>&1"; then
    echo "远程缺少 Secret aicook-secrets：首次部署请先 UPDATE_SECRETS=1 ./publish.sh 录入密钥。"
    exit 1
  fi

  # 把后端镜像版本写进清单（让仓库 yaml 跟踪当前部署版本），再整体 apply（tag 变更触发滚动更新）。
  # 用「捕获到变量再写回」做就地替换，兼容 GNU sed 与 macOS/BSD sed：
  # BSD 的 `sed -i` 需带备份后缀参数，直接 `sed -i "s|...|"` 会把脚本当成后缀、把文件名当成脚本，
  # 报 "invalid command code"。不用 `sed -i` 即可跨平台。
  local _updated
  _updated="$(sed "s|${IMAGE}:[^[:space:]\"]*|${IMAGE}:${VERSION_BACKEND}|g" "${K8S_MANIFEST}")"
  printf '%s\n' "${_updated}" > "${K8S_MANIFEST}"
  echo "→ 清单镜像版本已更新为 ${IMAGE}:${VERSION_BACKEND}"

  # 经 ssh stdin 直接 apply（无需 rsync，远程不落地清单文件）。
  echo "→ kubectl apply 整套清单（经 ssh stdin）"
  ssh "${SSH_ARGS[@]}" "kubectl apply -f -" < "${K8S_MANIFEST}"

  # 镜像 tag 变了 apply 已触发滚动；仅改密钥（spec 不变）时需显式重启加载新 env。
  if is_true "${UPDATE_SECRETS}"; then
    echo "→ 滚动重启 backend（加载新密钥）"
    ssh "${SSH_ARGS[@]}" "kubectl rollout restart deployment/backend -n ${NAMESPACE}"
  fi

  echo "→ 等待 backend 就绪"
  if ! ssh "${SSH_ARGS[@]}" "kubectl rollout status deployment/backend -n ${NAMESPACE} --timeout=${ROLLOUT_TIMEOUT_SEC}s"; then
    echo "滚动更新未在超时内就绪，远程诊断如下："
    ssh "${SSH_ARGS[@]}" "kubectl get pods -n ${NAMESPACE} -l app=backend -o wide; echo '--- logs ---'; kubectl logs -n ${NAMESPACE} deployment/backend --tail=40" || true
    exit 1
  fi
}

# /health 冒烟：任何 HTTP 状态都算“可达成功”（等价 ps1 的 -SkipHttpErrorCheck）；连不上才告警。
smoke_test() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "⚠ 未找到 curl，跳过冒烟测试。"
    return
  fi
  local url="https://${API_HOST}/health" code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -I "${url}" 2>/dev/null || true)
  if [ -n "${code}" ] && [ "${code}" != "000" ]; then
    echo "✓ ${url} -> HTTP ${code}"
  else
    echo "⚠ 冒烟测试失败（后端可能仍在启动，或 DNS/TLS 未就绪）：${url}"
    echo "  可手动查看：ssh -p ${REMOTE_PORT} ${REMOTE_HOST} \"kubectl logs -n ${NAMESPACE} deployment/backend --tail=50\""
  fi
}

# --- 1. 构建并推送 backend 镜像 ---
if is_true "${SKIP_BUILD}"; then
  echo "跳过构建（SKIP_BUILD）：请确保目标镜像已推送到 DockerHub，否则远程拉取会失败。"
else
  build_and_push_backend
fi

# --- 1.5 更新 k8s Secret（可选）---
if is_true "${UPDATE_SECRETS}"; then
  update_secrets
fi

# --- 2. 部署：把版本号写进清单 → 整体 apply（镜像 tag 变化触发滚动更新）---
if is_true "${SKIP_DEPLOY}"; then
  echo "跳过部署（SKIP_DEPLOY）"
  # 改了密钥但跳过部署时，仍需滚动重启让新密钥注入生效。
  if is_true "${UPDATE_SECRETS}"; then
    echo "已更新 Secret 但 SKIP_DEPLOY：滚动重启以让新密钥生效。"
    ssh "${SSH_ARGS[@]}" "kubectl rollout restart deployment/backend -n ${NAMESPACE}"
  fi
else
  deploy_backend
fi

# --- 3. 冒烟测试 ---
if ! is_true "${NO_SMOKE}" && ! is_true "${SKIP_DEPLOY}"; then
  smoke_test
fi

echo "发布完成"
