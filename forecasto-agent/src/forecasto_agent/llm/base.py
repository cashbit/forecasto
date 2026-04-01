"""Abstract base for LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Base class for LLM backends."""

    @abstractmethod
    async def extract_records(
        self,
        image_blocks: list[dict],
        system_prompt: str,
        user_prompt: str,
    ) -> list[dict]:
        """Given vision image blocks, return a list of record suggestion dicts."""
        ...
