# inference-service

本服务负责两类推理能力：

- 语音转写：`/v1/speech/transcriptions`
- 图片 OCR：`/v1/vision/ocr`

## 本地运行

1. 创建并激活 Python 3.11 虚拟环境。
2. 安装依赖：

```bash
pip install -r requirements.txt
```

3. 额外安装 `ffmpeg`，并确保它在系统 `PATH` 中。

Windows 建议：

- 使用 `winget install Gyan.FFmpeg`，或手动下载 ffmpeg。
- 安装后执行 `ffmpeg -version`，确认当前终端可以找到它。

4. 启动服务：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8088
```

## 说明

- 浏览器录音通常上传为 `webm/ogg/mp4`，服务会优先使用 `ffmpeg` 转成 `16k mono wav` 再交给 FunASR。
- 如果 `ffmpeg` 不存在、音频格式无法识别，且开启了 `AICOOK_ALLOW_DUMMY=true`，服务会返回 dummy 转写结果而不是直接 500。
- 当前图片建菜谱链路仍保留 OCR 能力，供多模态失败时回退。
