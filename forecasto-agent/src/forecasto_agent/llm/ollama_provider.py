"""Ollama local LLM provider.

Uses the Ollama /api/chat endpoint with vision-capable models (e.g. llava:34b).
Falls back to JSON mode parsing since Ollama doesn't support tool_use.
"""

from __future__ import annotations

import json
import logging
import re

import httpx

from .base import LLMProvider

logger = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    def __init__(self, model: str, base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def extract_records(
        self,
        image_blocks: list[dict],
        system_prompt: str,
        user_prompt: str,
    ) -> list[dict]:
        # Build Ollama message with images inline
        images_b64 = [b["source"]["data"] for b in image_blocks if b.get("type") == "image"]
        user_text = (user_prompt.strip() or "Extract all financial records from this document.")
        user_text += (
            "\n\nReturn ONLY a valid JSON array of record objects. "
            "Remember: 'account' = cost category (e.g. Consulenze, Hardware), "
            "'reference' = counterpart name + document number (e.g. 'Acme SRL — Fattura 42/2026'). "
            "No other text outside the JSON array."
        )

        payload = {
            "model": self.model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text, "images": images_b64},
            ],
            "format": "json",
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{self.base_url}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()

        raw = data.get("message", {}).get("content", "")
        return self._parse_json(raw)

    def _parse_json(self, raw: str) -> list[dict]:
        """Try to parse a JSON array from the LLM output."""
        raw = raw.strip()
        # Find first [ ... ] block
        match = re.search(r"\[[\s\S]*\]", raw)
        if match:
            try:
                result = json.loads(match.group())
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                pass
        # Try parsing as object with "records" key
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict) and "records" in obj:
                return obj["records"]
        except json.JSONDecodeError:
            pass
        logger.warning("Could not parse JSON from Ollama output: %s", raw[:200])
        return []
