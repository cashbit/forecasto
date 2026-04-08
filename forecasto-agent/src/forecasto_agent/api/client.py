"""Forecasto API client for the agent.

Auth: X-Agent-Token header (preferred) or X-API-Key header (legacy).
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)


class ForecastoClient:
    def __init__(self, base_url: str, api_key: str = "", agent_token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.agent_token = agent_token

    def _auth_headers(self) -> dict:
        if self.agent_token:
            return {"X-Agent-Token": self.agent_token}
        return {"X-API-Key": self.api_key}

    async def create_inbox_item(
        self,
        workspace_id: str,
        source_path: str,
        source_filename: str,
        source_hash: str,
        llm_provider: str,
        llm_model: str,
        extracted_data: list[dict],
        agent_version: str = "0.1.0",
        document_type: str | None = None,
        reconciliation_matches: list[dict] | None = None,
    ) -> str:
        """POST /api/v1/workspaces/{workspace_id}/inbox — returns the new item id."""
        payload = {
            "source_path": source_path,
            "source_filename": source_filename,
            "source_hash": source_hash,
            "llm_provider": llm_provider,
            "llm_model": llm_model,
            "agent_version": agent_version,
            "extracted_data": extracted_data,
        }
        if document_type is not None:
            payload["document_type"] = document_type
        if reconciliation_matches is not None:
            payload["reconciliation_matches"] = reconciliation_matches

        headers = {"Content-Type": "application/json", **self._auth_headers()}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/inbox",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
        return data["item"]["id"]

    async def notify_source_deleted(
        self,
        workspace_id: str,
        source_hash: str,
    ) -> int:
        """POST /api/v1/workspaces/{workspace_id}/inbox/source-deleted — returns count updated."""
        headers = {"Content-Type": "application/json", **self._auth_headers()}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/inbox/source-deleted",
                params={"source_hash": source_hash},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
        return data.get("updated", 0)

    async def list_workspaces(self) -> list[dict]:
        """List workspaces accessible to this agent token."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/agent/workspaces",
                headers=self._auth_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("workspaces", [])

    async def upload_document(
        self,
        workspace_id: str,
        file_path: "Path",
        content_type: str | None = None,
    ) -> dict:
        """Upload a raw file to the server for processing.

        Returns {job_id, status, queue_position}.
        """
        import mimetypes
        from pathlib import Path as _Path

        if content_type is None:
            content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"

        async with httpx.AsyncClient(timeout=120) as client:
            with open(file_path, "rb") as f:
                resp = await client.post(
                    f"{self.base_url}/api/v1/workspaces/{workspace_id}/inbox/upload",
                    headers=self._auth_headers(),
                    files={"file": (file_path.name, f, content_type)},
                )
                resp.raise_for_status()
        return resp.json()

    async def search_payment_matches(
        self,
        workspace_id: str,
        amount: float,
        reference: str,
    ) -> list[dict]:
        """Find existing records that match a payment amount and reference."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/records/payment-match",
                headers=self._auth_headers(),
                params={"amount": amount, "reference": reference},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("matches", [])


# Backward-compat alias
ForecastoAgentClient = ForecastoClient
