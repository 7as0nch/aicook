from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_FUNASR_MODEL = "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
FUNASR_MODEL_ALIASES = {
    "paraformer-zh": DEFAULT_FUNASR_MODEL,
}
FFMPEG_REQUIRED_SUFFIXES = {".webm", ".ogg", ".oga", ".mp4", ".m4a", ".aac", ".mov"}


class SpeechService:
    def __init__(self) -> None:
        self.allow_dummy = os.getenv("AICOOK_ALLOW_DUMMY", "true").lower() == "true"
        self.strict_mode = os.getenv("AICOOK_STRICT_FUNASR", "false").lower() == "true"
        self.model_name = os.getenv("FUNASR_MODEL", DEFAULT_FUNASR_MODEL)
        self.device = os.getenv("FUNASR_DEVICE", "cpu")
        self._model = None
        self._status = "idle"
        self._last_error: str | None = None
        self._ffmpeg = shutil.which("ffmpeg")

    def _load_model(self):
        if self._model is not None:
            return self._model

        try:
            from funasr import AutoModel  # type: ignore
        except Exception as exc:
            return self._handle_load_failure(f"FunASR import 失败: {exc}", exc)

        try:
            self._model = AutoModel(
                model=self._resolve_model_name(self.model_name),
                device=self.device,
                disable_update=True,
            )
        except Exception as exc:
            return self._handle_load_failure(self._build_init_error(exc), exc)
        self._status = "ready"
        self._last_error = None
        return self._model

    def _resolve_model_name(self, model_name: str) -> str:
        normalized = model_name.strip()
        if not normalized:
            return DEFAULT_FUNASR_MODEL
        return FUNASR_MODEL_ALIASES.get(normalized, normalized)

    def _build_init_error(self, exc: Exception) -> str:
        detail = str(exc)
        if isinstance(exc, ModuleNotFoundError):
            if exc.name == "modelscope":
                return "FunASR 模型初始化失败: 缺少 modelscope，请在当前 venv 中安装 modelscope 后重试"
            if exc.name == "torch":
                return "FunASR 模型初始化失败: 缺少 torch，请先安装 torch / torchaudio"

        if "not registered" in detail.lower():
            return (
                "FunASR 模型初始化失败: "
                f"{self.model_name} 未注册，请改用 {self._resolve_model_name(self.model_name)}"
            )
        return f"FunASR 模型初始化失败: {detail}"

    def _handle_load_failure(self, message: str, exc: Exception):
        self._last_error = message
        if self.allow_dummy or not self.strict_mode:
            logger.warning(
                "%s；已切换到 dummy 转写。若需直接失败，请设置 AICOOK_STRICT_FUNASR=true。", message
            )
            logger.debug("FunASR fallback details", exc_info=exc)
            self._model = False
            self._status = "dummy"
            return self._model
        logger.exception(message)
        self._status = "error"
        raise RuntimeError(self._last_error) from exc

    def transcribe_bytes(self, payload: bytes, filename: str) -> dict[str, Any]:
        model = self._load_model()
        if model is False:
            return {
                "text": "当前环境未就绪，已返回演示转写结果。",
                "confidence": 0.0,
                "segments": [],
                "status": "dummy",
                "error": self._last_error or "FunASR 未就绪",
            }

        suffix = Path(filename).suffix or ".wav"
        temp_path = ""
        decode_path = ""
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
            temp.write(payload)
            temp_path = temp.name

        try:
            decode_path = self._prepare_audio_input(temp_path, filename)
            result = model.generate(input=decode_path)
            text = ""
            segments = []
            if isinstance(result, list) and result:
                item = result[0]
                text = item.get("text", "")
                timestamps = item.get("timestamp", [])
                for segment in timestamps:
                    if len(segment) >= 3:
                        segments.append(
                            {
                                "start_ms": int(segment[0]),
                                "end_ms": int(segment[1]),
                                "text": str(segment[2]),
                                "score": 1.0,
                            }
                        )
            return {
                "text": text,
                "confidence": 1.0 if text else 0.0,
                "segments": segments,
                "status": "ready",
            }
        except Exception as exc:
            message = self._build_transcribe_error(exc, filename)
            if self.allow_dummy or not self.strict_mode:
                logger.warning("%s；已切换到 dummy 转写。", message)
                logger.debug("FunASR transcribe fallback details", exc_info=exc)
                self._status = "dummy"
                self._last_error = message
                return {
                    "text": "当前环境未就绪，已返回演示转写结果。",
                    "confidence": 0.0,
                    "segments": [],
                    "status": "dummy",
                    "error": message,
                }
            self._status = "error"
            self._last_error = message
            raise RuntimeError(message) from exc
        finally:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except Exception:
                pass
            if decode_path and decode_path != temp_path:
                try:
                    Path(decode_path).unlink(missing_ok=True)
                except Exception:
                    pass

    def _prepare_audio_input(self, source_path: str, filename: str) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix not in FFMPEG_REQUIRED_SUFFIXES:
            return source_path
        if not self._ffmpeg:
            raise RuntimeError("缺少 ffmpeg，请安装 ffmpeg 并加入 PATH，用于解码 webm/ogg/mp4 音频")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
            target_path = temp.name
        cmd = [
            self._ffmpeg,
            "-y",
            "-i",
            source_path,
            "-ac",
            "1",
            "-ar",
            "16000",
            target_path,
        ]
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except FileNotFoundError as exc:
            raise RuntimeError("未找到 ffmpeg 可执行文件，请确认 ffmpeg 已加入 PATH") from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or b"").decode("utf-8", errors="ignore").strip()
            raise RuntimeError(f"ffmpeg 音频转码失败: {detail or '无法将上传音频转换为 16k wav'}") from exc
        return target_path

    def _build_transcribe_error(self, exc: Exception, filename: str) -> str:
        detail = str(exc)
        suffix = Path(filename).suffix.lower()
        if "ffmpeg" in detail.lower():
            return detail
        if "format not recognised" in detail.lower():
            return (
                f"音频转写失败: 当前环境无法识别 {suffix or '上传音频'} 格式，"
                "请安装 ffmpeg 并加入 PATH，或改传 wav/mp3"
            )
        if isinstance(exc, FileNotFoundError):
            return "音频转写失败: 系统找不到音频解码依赖，请确认 ffmpeg 已安装并加入 PATH"
        return f"音频转写失败: {detail}"

    def health_status(self) -> dict[str, Any]:
        try:
            self._load_model()
        except Exception:
            pass
        return {
            "status": self._status,
            "allow_dummy": self.allow_dummy,
            "strict_mode": self.strict_mode,
            "model": self.model_name,
            "resolved_model": self._resolve_model_name(self.model_name),
            "device": self.device,
            "ffmpeg": self._ffmpeg,
            "error": self._last_error,
        }
