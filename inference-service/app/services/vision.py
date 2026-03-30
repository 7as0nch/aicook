from __future__ import annotations

import io
import os
from typing import Any

from PIL import Image


class VisionService:
    def __init__(self) -> None:
        self.allow_dummy = os.getenv("AICOOK_ALLOW_DUMMY", "true").lower() == "true"
        self.lang = os.getenv("PADDLEOCR_LANG", "ch")
        self._ocr = None

    def _load_model(self):
        if self._ocr is not None:
            return self._ocr

        try:
            from paddleocr import PaddleOCR  # type: ignore
        except Exception:
            if self.allow_dummy:
                self._ocr = False
                return self._ocr
            raise

        self._ocr = PaddleOCR(use_angle_cls=True, lang=self.lang, show_log=False)
        return self._ocr

    def recognize_images(self, files: list[tuple[str, bytes]]) -> dict[str, Any]:
        ocr = self._load_model()
        if ocr is False:
            pages = []
            full_text = []
            for index, (name, _) in enumerate(files, start=1):
                text = f"演示 OCR 结果: {name}"
                pages.append(
                    {
                        "page_no": index,
                        "text": text,
                        "confidence": 0.0,
                        "blocks": [{"text": text, "confidence": 0.0, "bbox": [0, 0, 0, 0]}],
                    }
                )
                full_text.append(text)
            return {"pages": pages, "text": "\n".join(full_text)}

        pages = []
        full_text = []
        for index, (_, payload) in enumerate(files, start=1):
            image = Image.open(io.BytesIO(payload)).convert("RGB")
            result = ocr.ocr(image, cls=True)
            blocks = []
            lines = []
            scores = []
            for line in result[0] if result else []:
                bbox = [int(value) for point in line[0] for value in point]
                text = line[1][0]
                score = float(line[1][1])
                blocks.append({"text": text, "confidence": score, "bbox": bbox})
                lines.append(text)
                scores.append(score)

            page_text = "\n".join(lines)
            full_text.append(page_text)
            pages.append(
                {
                    "page_no": index,
                    "text": page_text,
                    "confidence": sum(scores) / len(scores) if scores else 0.0,
                    "blocks": blocks,
                }
            )

        return {"pages": pages, "text": "\n".join(filter(None, full_text))}
