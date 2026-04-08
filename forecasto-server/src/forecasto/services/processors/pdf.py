"""PDF to base64 JPEG conversion for vision API."""

from __future__ import annotations

import base64
import io
import logging

import fitz  # PyMuPDF
from PIL import Image

logger = logging.getLogger(__name__)

MAX_PAGES = 20
MAX_WIDTH = 1568
DPI = 144


def pdf_bytes_to_base64_images(file_bytes: bytes) -> list[dict]:
    """Convert PDF bytes to a list of Anthropic vision-compatible image blocks."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = min(len(doc), MAX_PAGES)
    if len(doc) > MAX_PAGES:
        logger.warning("PDF has %d pages, processing only first %d", len(doc), MAX_PAGES)

    blocks = []
    for i in range(pages):
        page = doc[i]
        pix = page.get_pixmap(dpi=DPI)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            img = img.resize((MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64,
            },
        })
    doc.close()
    return blocks
