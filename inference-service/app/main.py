from fastapi import FastAPI, File, HTTPException, UploadFile

from app.services.speech import SpeechService
from app.services.vision import VisionService

app = FastAPI(title="aicook-inference", version="0.1.0")

speech_service = SpeechService()
vision_service = VisionService()


@app.get("/health")
async def health() -> dict:
    speech = speech_service.health_status()
    return {
        "status": "ok" if speech.get("status") in {"ready", "dummy", "idle"} else "degraded",
        "speech": speech,
    }


@app.post("/v1/speech/transcriptions")
async def speech_transcriptions(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="缺少音频文件")

    file = files[0]
    payload = await file.read()
    try:
        return speech_service.transcribe_bytes(payload, file.filename or "audio.webm")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/vision/ocr")
async def vision_ocr(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="缺少图片文件")

    payloads: list[tuple[str, bytes]] = []
    for file in files:
        payloads.append((file.filename or "image.png", await file.read()))
    return vision_service.recognize_images(payloads)
