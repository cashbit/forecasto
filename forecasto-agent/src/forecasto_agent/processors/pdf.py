"""PDF processor: convert PDF pages to base64-encoded JPEG images for vision APIs."""

from __future__ import annotations

import base64
import io
from pathlib import Path

import fitz  # PyMuPDF


MAX_PAGES = 20
DPI = 144
MAX_WIDTH = 1568  # Anthropic recommended max width for vision


def pdf_to_base64_images(path: Path, max_pages: int = MAX_PAGES) -> list[dict]:
    """Convert each PDF page to a base64 JPEG image.

    Returns a list of dicts compatible with Anthropic vision message format:
      [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "..."}}]
    """
    doc = fitz.open(str(path))
    images = []

    for page_num in range(min(len(doc), max_pages)):
        page = doc[page_num]
        # Render at target DPI
        mat = fitz.Matrix(DPI / 72, DPI / 72)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)

        # Resize if wider than MAX_WIDTH
        if pix.width > MAX_WIDTH:
            scale = MAX_WIDTH / pix.width
            mat2 = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat2, colorspace=fitz.csRGB)

        img_bytes = pix.tobytes("jpeg")
        b64 = base64.standard_b64encode(img_bytes).decode("ascii")
        images.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64,
            },
        })

    doc.close()
    return images
