<#
.SYNOPSIS
  AICook 后端发布脚本（Windows / PowerShell 7+）。只发 backend：构建并推送指定版本镜像，
  把版本号写进 k8s 清单并整体 apply。密钥单独走 k8s Secret（-UpdateSecrets，默认跳过）。

.DESCRIPTION
  与 publish.sh 等价，但为 Windows 本机设计（无需 rsync）：
    1) docker buildx 构建 linux/amd64 镜像并 --push（tag = -Version，外加 :latest）；
    2) 把 -Version 写进 k8s-deployment.yaml 的后端镜像 tag，再整体 kubectl apply（tag 变更触发滚动更新）；
    3) kubectl rollout status 等待就绪 + /health 冒烟。

  日常发版只需改 -Version（如 -Version v1.0.6）：自动打包 → 写版本号进清单 → apply。
  密钥不在 ConfigMap：ConfigMap 用 ${VAR} 占位，真实密钥在 k8s Secret aicook-secrets，由 -UpdateSecrets
  交互式录入（base64 走 stdin，不经命令行）。默认【不】录入密钥（跳过）。首次部署需先 -UpdateSecrets 建
  Secret，否则 Pod 会 CreateContainerConfigError（脚本部署前会预检 Secret 是否存在）。

  前置：已 docker login；本机有 docker / ssh；SSH 公钥已加到远程（端口 837，首次连接需接受 host key）。

.EXAMPLE
  ./publish.ps1 -Version v1.0.6              # 日常发版：打包 v1.0.6 → 写进清单 → apply
.EXAMPLE
  ./publish.ps1 -Version v1.0.6 -SkipBuild   # 镜像已推送，只更新清单版本并 apply
.EXAMPLE
  ./publish.ps1 -SkipDeploy                  # 只构建 + 推送镜像，不部署
.EXAMPLE
  ./publish.ps1 -UpdateSecrets               # 逐项隐藏录入密钥（不要粘贴！），再部署
.EXAMPLE
  ./publish.ps1 -UpdateSecrets -SecretsFile .\secrets.env -SkipBuild   # 从文件读密钥（复制粘贴推荐用这个）
#>
[CmdletBinding()]
param(
  [string]$DockerUser        = '7as0nch',
  [string]$Version           = 'v0.1.5',
  [string]$ImageTag          = 'latest',
  [string]$Platform          = 'linux/amd64',
  [string]$RemoteHost        = 'root@sshjd.aihelper.chat',
  [int]   $RemotePort        = 22,
  [string]$Namespace         = 'aicook',
  [string]$ApiHost           = 'aicookapi.aihelper.chat',
  [int]   $RolloutTimeoutSec = 180,
  [string]$SecretsFile       = '',
  [switch]$SkipBuild,
  [switch]$SkipDeploy,
  [switch]$UpdateSecrets,
  [switch]$NoSmoke
)

$ErrorActionPreference = 'Stop'
# 显式固定为 UTF-8 无 BOM：保证管道给原生命令（ssh）的 stdin 是 UTF-8，不依赖用户 profile。
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$RepoRoot = $PSScriptRoot
$Image    = "$DockerUser/aicook-backend"
# 复用的 ssh 参数：-T 不分配 tty；ConnectTimeout 避免网络问题时无限挂起。
$SshArgs  = @('-T', '-o', 'ConnectTimeout=10', '-p', "$RemotePort", $RemoteHost)

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$What,
    [Parameter(Mandatory)][scriptblock]$Action
  )
  Write-Host "→ $What" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$What 失败（exit $LASTEXITCODE）" }
}

# Docker Desktop 默认 builder 一般支持 --push；若当前是 legacy 的 `docker` 驱动则不支持，
# 临时建一个 docker-container builder 并通过 --builder 指定（不改用户默认 builder）。
function Get-PushBuilderArgs {
  $inspect = (docker buildx inspect 2>$null | Out-String)
  if ($inspect -match '(?m)^\s*Driver:\s+docker\s*$') {
    Write-Host '当前 buildx 为 docker 驱动（不支持 --push），改用 docker-container builder：aicook-builder' -ForegroundColor Yellow
    docker buildx inspect aicook-builder *> $null
    if ($LASTEXITCODE -ne 0) { docker buildx create --name aicook-builder --driver docker-container *> $null }
    return @('--builder', 'aicook-builder')
  }
  return @()
}

# 8 个密钥键及其交互提示（顺序固定）。
$SecretKeys = [ordered]@{
  PG_PASSWORD      = 'PostgreSQL 密码'
  REDIS_PASSWORD   = 'Redis 密码'
  MINIO_ACCESS_KEY = 'MinIO Access Key'
  MINIO_SECRET_KEY = 'MinIO Secret Key'
  JWT_SECRET       = 'JWT 签名密钥'
  MIMO_API_KEY     = 'MiMo API Key（ai.api_key）'
  DOUBAO_API_KEY   = 'Doubao 向量 API Key'
  WX_SECRET        = '微信小程序 AppSecret'
}

function ConvertTo-B64([string]$s) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)) }

# 把 KEY->base64 数据写进 k8s Secret aicook-secrets（确保 ns/secret 存在，再 merge patch，只动给到的键）。
# base64 经 stdin 传给远程 kubectl，明文不进命令行/进程列表。
function Write-Secrets($Data) {
  if ($Data.Count -eq 0) { Write-Host '未提供任何密钥，跳过。' -ForegroundColor Yellow; return }
  ssh @SshArgs "kubectl get namespace $Namespace >/dev/null 2>&1 || kubectl create namespace $Namespace"
  ssh @SshArgs "kubectl get secret aicook-secrets -n $Namespace >/dev/null 2>&1 || kubectl create secret generic aicook-secrets -n $Namespace"
  $patch = @{ data = $Data } | ConvertTo-Json -Compress
  $patch | ssh @SshArgs "kubectl patch secret aicook-secrets -n $Namespace --type=merge --patch-file=/dev/stdin"
  if ($LASTEXITCODE -ne 0) { throw "更新 Secret 失败（exit $LASTEXITCODE）" }
  Write-Host "✓ 已更新 Secret aicook-secrets（$($Data.Count) 项）" -ForegroundColor Green
}

# 录入密钥：优先从 -SecretsFile 读（每行 KEY=value，#注释/空行忽略），否则逐项隐藏输入。
# 注意：往隐藏提示里【粘贴】不可靠（容易只收到回车），复制粘贴务必用 -SecretsFile。
function Update-Secrets {
  $data = [ordered]@{}
  if ($SecretsFile) {
    if (-not (Test-Path -LiteralPath $SecretsFile)) { throw "找不到密钥文件: $SecretsFile" }
    Write-Host "从文件读取密钥: $SecretsFile" -ForegroundColor Cyan
    foreach ($line in Get-Content -LiteralPath $SecretsFile -Encoding utf8) {
      $t = $line.Trim()
      if ($t -eq '' -or $t.StartsWith('#')) { continue }
      $i = $t.IndexOf('=')
      if ($i -lt 1) { continue }
      $k = $t.Substring(0, $i).Trim()
      $v = ($t.Substring($i + 1) -replace '[\x00-\x1F\x7F]', '').Trim()
      if (-not $SecretKeys.Contains($k)) { Write-Host "  跳过未知键: $k" -ForegroundColor DarkGray; continue }
      if ($v -ne '') { $data[$k] = ConvertTo-B64 $v }
    }
  } else {
    Write-Host '逐项录入密钥（直接回车=跳过）。注意：往隐藏框【粘贴】不可靠，复制粘贴请改用 -SecretsFile。' -ForegroundColor Cyan
    foreach ($k in $SecretKeys.Keys) {
      $sec   = Read-Host -AsSecureString "  $($SecretKeys[$k])  [$k]"
      $plain = [System.Net.NetworkCredential]::new('', $sec).Password -replace '[\x00-\x1F\x7F]', ''
      if ($plain -ne '') { $data[$k] = ConvertTo-B64 $plain }
    }
  }
  Write-Secrets $data
}

# --- 1. 构建并推送 backend 镜像 ---
if (-not $SkipBuild) {
  $dockerfile  = Join-Path $RepoRoot 'backend\Dockerfile'
  $context     = Join-Path $RepoRoot 'backend'
  $builderArgs = Get-PushBuilderArgs
  Invoke-Native "构建并推送 ${Image}:${ImageTag}（${Platform}）" {
    docker buildx build @builderArgs --platform $Platform `
      -t "${Image}:${ImageTag}" `
      -t "${Image}:${Version}" `
      -f "$dockerfile" "$context" --push
  }
} else {
  Write-Host '跳过构建（-SkipBuild）：请确保目标镜像已推送到 DockerHub，否则远程拉取会失败。' -ForegroundColor Yellow
}

# --- 1.5 更新 k8s Secret（可选，交互式录入）---
if ($UpdateSecrets) {
  Update-Secrets
}

# --- 2. 部署：把版本号写进清单 → 整体 apply（镜像 tag 变化触发滚动更新）---
if (-not $SkipDeploy) {
  # 预检：Secret 必须存在，否则新 Pod 会 CreateContainerConfigError。
  ssh @SshArgs "kubectl get secret aicook-secrets -n $Namespace -o name" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "远程缺少 Secret aicook-secrets：首次部署请先跑 .\publish.ps1 -UpdateSecrets 录入密钥。"
  }

  # 把镜像版本写进本地清单（让仓库 yaml 跟踪当前部署版本），再整体 apply。
  $k8sPath = Join-Path $RepoRoot 'k8s-deployment.yaml'
  $content = (Get-Content -Raw -LiteralPath $k8sPath -Encoding utf8).TrimStart([char]0xFEFF)
  $updated = [regex]::Replace($content, [regex]::Escape($Image) + ':[^\s"]+', "${Image}:$Version")
  if ($updated -ne $content) {
    [System.IO.File]::WriteAllText($k8sPath, ($updated -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Host "→ 清单镜像版本已更新为 ${Image}:$Version" -ForegroundColor Cyan
  } else {
    Write-Host "清单镜像已是 ${Image}:$Version（无改动）" -ForegroundColor DarkGray
  }

  Write-Host '→ kubectl apply 整套清单' -ForegroundColor Cyan
  ($updated -replace "`r`n", "`n") | ssh @SshArgs "kubectl apply -f -"
  if ($LASTEXITCODE -ne 0) { throw "kubectl apply 失败（exit $LASTEXITCODE）" }

  # 镜像 tag 变了 apply 已触发滚动；仅改了密钥（Deployment spec 不变）时需显式重启才能加载新 env。
  if ($UpdateSecrets) {
    Invoke-Native '滚动重启 backend（加载新密钥）' {
      ssh @SshArgs "kubectl rollout restart deployment/backend -n $Namespace"
    }
  }
  try {
    Invoke-Native '等待 backend 就绪' {
      ssh @SshArgs "kubectl rollout status deployment/backend -n $Namespace --timeout=${RolloutTimeoutSec}s"
    }
  } catch {
    Write-Host '滚动更新未在超时内就绪，远程诊断如下：' -ForegroundColor Yellow
    ssh @SshArgs "kubectl get pods -n $Namespace -l app=backend -o wide; echo '--- logs ---'; kubectl logs -n $Namespace deployment/backend --tail=40"
    throw
  }
} else {
  Write-Host '跳过部署（-SkipDeploy）' -ForegroundColor Yellow
}

# 改了密钥但跳过部署时，仍需滚动重启让新密钥注入生效。
if ($UpdateSecrets -and $SkipDeploy) {
  Invoke-Native '滚动重启 backend（应用新密钥）' {
    ssh @SshArgs "kubectl rollout restart deployment/backend -n $Namespace"
  }
}

# --- 3. 冒烟测试 ---
if (-not $NoSmoke -and -not $SkipDeploy) {
  $url = "https://$ApiHost/health"
  try {
    $resp = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 15 -SkipHttpErrorCheck
    Write-Host "✓ $url -> HTTP $($resp.StatusCode)" -ForegroundColor Green
  } catch {
    Write-Host "⚠ 冒烟测试失败（后端可能仍在启动，或 DNS/TLS 未就绪）：$url`n  $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  可手动查看：ssh -p $RemotePort $RemoteHost ""kubectl logs -n $Namespace deployment/backend --tail=50""" -ForegroundColor Yellow
  }
}

Write-Host '发布完成' -ForegroundColor Green
