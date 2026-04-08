"""Image to base64 JPEG conversion for vision API."""

from __future__ import annotations

import base64
import io
import logging

from PIL import Image

logger = logging.getLogger(__name__)

MAX_WIDTH = 1568

MIME_MAP = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
}


def image_bytes_to_base64(file_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """Convert image bytes to an Anthropic vision-compatible image block."""
    img = Image.open(io.BytesIO(file_bytes))

    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        img = img.resize((MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": b64,
        },
    }
