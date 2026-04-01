"""Image processor: validate and encode images for vision APIs."""

from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_WIDTH = 1568
JPEG_QUALITY = 85


def image_to_base64(path: Path) -> dict:
    """Load an image, resize if needed, return Anthropic vision block dict."""
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported image format: {suffix}")

    with Image.open(path) as img:
        # Convert to RGB (handles RGBA PNG, palette mode, etc.)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Resize if too wide
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            new_size = (MAX_WIDTH, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        img_bytes = buf.getvalue()

    b64 = base64.standard_b64encode(img_bytes).decode("ascii")
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": b64,
        },
    }
