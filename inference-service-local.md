# inference-service 本地接入说明

## 1. 这是什么

`inference-service` 是 AICook 的本地推理服务，当前提供两类能力：

- OCR：`POST /v1/vision/ocr`
- 语音转写：`POST /v1/speech/transcriptions`

前端不会直接调用它，链路是：

1. 前端上传图片或音频到 `backend`
2. `backend` 从对象存储读取文件
3. `backend/internal/platform/inference/client.go` 再转发到 `inference-service`
4. 推理结果回到 `backend`，再返回给前端

## 2. 哪些前端功能会触发

- 图片导入菜谱：
  `frontend` 的 AI 助手传图、工作台图片识别，最终会走 `backend/internal/service/importer.go`
- 语音输入转写：
  AI 助手长按输入框录音、`VoiceHoldButton` 录音，最终会走 `backend/internal/service/voice.go`

## 3. 本地至少要启动哪些服务

推荐按下面顺序启动：

1. PostgreSQL
2. Redis
3. MinIO
4. `inference-service`
5. `backend`
6. `frontend`

如果只启动了前后端但没有启动 `inference-service`，图片 OCR 和语音转写会失败。

## 4. 关键配置

`backend/configs/config.yaml` 里默认配置如下：

```yaml
inference:
  endpoint: http://127.0.0.1:8088
  timeout: 30s
```

也就是说，`inference-service` 本地默认需要监听 `127.0.0.1:8088`。

## 5. inference-service 启动方式

在 `inference-service` 目录准备 Python 环境并安装依赖后启动，例如：

```bash
export AICOOK_STRICT_FUNASR="false"
export FUNASR_MODEL="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
export FUNASR_DEVICE="cpu"
export AICOOK_ALLOW_DUMMY="false"
uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload
```

如果你是 Windows + `venv`，并且启动时看到 `No module named 'torch'`，请优先在**已激活的当前虚拟环境**里执行：

```powershell
python -m pip install --upgrade pip
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
pip install modelscope
pip install -r requirements.txt
python -c "import torch; import torchaudio; print(torch.__version__)"
```

只有最后一条命令成功，FunASR 才真正具备运行条件。

健康检查：

```bash
curl http://127.0.0.1:8088/health
```

返回：

```json
{"status":"ok","speech":{"status":"ready","allow_dummy":false,"strict_mode":false,"model":"iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch","resolved_model":"iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch","device":"cpu","error":null}}
```

## 6. 依赖与资源要求

当前实现里：

- OCR 由 `app.services.vision.VisionService` 提供
- 语音由 `app.services.speech.SpeechService` 提供

本地通常需要准备：

- PyTorch 运行时（`torch` / `torchaudio`，FunASR 必需）
- ModelScope（FunASR 下载和加载官方模型必需）
- FunASR 相关模型或运行时依赖
- PaddleOCR 相关模型或运行时依赖
- 足够的磁盘空间用于首次模型下载
- 至少可用的 CPU 内存余量；在纯 CPU 环境下首次推理会明显变慢

如果你的本地环境没有这些模型，服务虽然可能能启动，但真实 OCR/转写能力会退化或失败。现在可以通过 `/health` 返回的 `speech.status` 快速判断：

- `ready`：真实 FunASR 已加载。
- `dummy`：当前走演示转写降级，通常是 `AICOOK_ALLOW_DUMMY=true` 且导入或初始化失败。
- `error` / `degraded`：FunASR 导入或模型初始化失败，需要先修 Python 依赖或模型环境。

如果日志里直接出现 `No module named 'torch'`，说明当前 Python 环境里还没有安装好 PyTorch；这时要么先重新安装 `requirements.txt`，要么临时开启 `AICOOK_ALLOW_DUMMY=true` 让语音链路先以演示模式跑通。

如果日志继续提示：

- `No module named 'modelscope'`
- `paraformer-zh is not registered`

说明还没有真正切到可用模型环境。建议按下面顺序处理：

1. 在当前 `venv` 执行 `pip install modelscope`
2. 把 `FUNASR_MODEL` 改成完整模型名 `iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`
3. 重启 `uvicorn`
4. 访问 `/health`，确认 `speech.status=ready`

日志中提到的 `ffmpeg` 不是当前主阻塞。当前实现已经可以通过 `torchaudio` 加载音频；安装 `ffmpeg` 只是补充更多音频解码后端，不会单独修复 `modelscope` 或模型注册失败。

需要特别注意：

- 当 `AICOOK_ALLOW_DUMMY=true`，或者 `AICOOK_STRICT_FUNASR=false` 时，`SpeechService` 会在缺少 `torch` / 模型初始化失败后切到 `dummy` 模式。
- 这时 `/v1/speech/transcriptions` 仍可能返回 `200 OK`，但返回的是演示转写文本，不是真实 ASR 结果。
- 如果你希望缺依赖时直接失败，请显式设置：

```bash
export AICOOK_STRICT_FUNASR="true"
export AICOOK_ALLOW_DUMMY="false"
```

PowerShell 写法：

```powershell
$env:AICOOK_STRICT_FUNASR="true"
$env:AICOOK_ALLOW_DUMMY="false"
```

## 7. 与对象存储的关系

前端上传的图片/音频先进入 MinIO，再由 `backend` 下载字节后发给推理服务。

因此这条链路依赖同时成立：

- 前端能上传到 MinIO
- `backend` 能读取 MinIO
- `backend` 能访问 `inference.endpoint`

任何一段不通，前端表现都会是“导入失败”或“语音识别失败”。

## 8. 当前本地联调建议

- 先验证 `inference-service /health`
- 再验证 `backend` 的 `/api/v1/media/transcriptions`
- 最后验证前端 AI 助手长按录音、图片导入菜谱

## 9. 当前缺口

- 仓库还没有把 `inference-service` 完整纳入统一的 compose 一键启动链路
- 模型下载、缓存目录、CPU/内存建议没有收敛成统一脚本
- `AICOOK_ALLOW_DUMMY` 建议默认关闭，本地只在排查链路时临时开启
