"""Async queue and worker for document processing.

Flow:
  watchdog event → put file path on queue → worker dequeues →
  read folder config → detect file type → process (pdf/image) →
  call LLM → POST to server → update cache → notify tray
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path

from forecasto_agent import cache as file_cache
from forecasto_agent.api.client import ForecastoClient
from forecasto_agent.config import AgentConfig, WatchedFolder
from forecasto_agent.llm.anthropic_provider import AnthropicProvider
from forecasto_agent.llm.ollama_provider import OllamaProvider
from forecasto_agent.processors.image import image_to_base64
from forecasto_agent.processors.pdf import pdf_to_base64_images

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"}
AGENT_VERSION = "0.1.0"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def find_watched_folder(path: Path, config: AgentConfig) -> WatchedFolder | None:
    """Find which watched folder contains the given path."""
    for folder in config.watched_folders:
        try:
            path.relative_to(folder.path)
            return folder
        except ValueError:
            continue
    return None


class DocumentQueue:
    def __init__(self, config: AgentConfig, on_processed: "Callable[[int], None] | None" = None):
        self.config = config
        self.on_processed = on_processed  # callback to update tray badge
        self._queue: asyncio.Queue[Path] = asyncio.Queue()
        self._delete_queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()  # (hash, workspace_id)
        self._running = False

    def enqueue(self, path: Path) -> None:
        """Called from watchdog thread — thread-safe."""
        try:
            self._queue.put_nowait(path)
        except asyncio.QueueFull:
            logger.warning("Queue full, dropping %s", path)

    def enqueue_delete(self, file_hash: str, workspace_id: str) -> None:
        try:
            self._delete_queue.put_nowait((file_hash, workspace_id))
        except asyncio.QueueFull:
            pass

    async def run(self) -> None:
        self._running = True
        logger.info("Document queue worker started")
        while self._running:
            await asyncio.gather(
                self._process_next(),
                self._process_next_delete(),
            )

    async def stop(self) -> None:
        self._running = False

    async def _process_next(self) -> None:
        try:
            path = await asyncio.wait_for(self._queue.get(), timeout=1.0)
        except asyncio.TimeoutError:
            return
        try:
            await self._process_file(path)
        except Exception:
            logger.exception("Error processing %s", path)
        finally:
            self._queue.task_done()

    async def _process_next_delete(self) -> None:
        try:
            file_hash, workspace_id = await asyncio.wait_for(self._delete_queue.get(), timeout=0.1)
        except asyncio.TimeoutError:
            return
        try:
            await self._notify_deleted(file_hash, workspace_id)
        except Exception:
            logger.exception("Error notifying delete for hash %s", file_hash)
        finally:
            self._delete_queue.task_done()

    async def _process_file(self, path: Path) -> None:
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            return

        # Wait for the file to be fully written (up to 5s)
        for _ in range(10):
            if path.exists() and path.stat().st_size > 0:
                break
            await asyncio.sleep(0.5)
        else:
            logger.warning("File not ready after 5s, skipping: %s", path.name)
            return

        folder = find_watched_folder(path, self.config)
        if not folder:
            logger.warning("No watched folder found for %s", path)
            return

        file_hash = sha256_file(path)

        if file_cache.is_already_processed(str(path), file_hash):
            logger.debug("Already processed %s (hash %s)", path.name, file_hash[:8])
            return

        logger.info("Processing %s", path.name)
        file_cache.mark_processing(str(path), file_hash)

        # Server-side processing mode: just upload the raw file
        if getattr(folder, 'processing_mode', 'local') == 'server':
            try:
                api_client = ForecastoClient(
                    base_url=self.config.server.base_url,
                    api_key=self.config.server.api_key,
                    agent_token=self.config.agent_token,
                )
                result = await api_client.upload_document(
                    workspace_id=folder.workspace_id,
                    file_path=path,
                )
                job_id = result.get("job_id", "")
                file_cache.mark_sent(str(path), file_hash, job_id)
                logger.info("Uploaded %s for server processing (job_id=%s)", path.name, job_id)
                if self.on_processed:
                    self.on_processed(1)
                return
            except Exception:
                logger.exception("Failed to upload %s to server", path.name)
                file_cache.mark_error(str(path), file_hash)
                return

        try:
            # Convert file to vision blocks
            if path.suffix.lower() == ".pdf":
                image_blocks = pdf_to_base64_images(path)
            else:
                image_blocks = [image_to_base64(path)]
        except Exception:
            logger.exception("Failed to process file %s", path)
            file_cache.mark_error(str(path), file_hash)
            return

        # Build LLM provider
        llm_cfg = folder.llm
        try:
            if llm_cfg.provider == "ollama":
                provider = OllamaProvider(
                    model=llm_cfg.model,
                    base_url=llm_cfg.ollama_base_url,
                )
            else:
                api_key = llm_cfg.api_key or None
                provider = AnthropicProvider(model=llm_cfg.model, api_key=api_key)

            records = await provider.extract_records(
                image_blocks=image_blocks,
                system_prompt=folder.system_prompt,
                user_prompt=folder.user_prompt,
            )
        except Exception:
            logger.exception("LLM extraction failed for %s", path.name)
            file_cache.mark_error(str(path), file_hash)
            return

        # For payment documents, search for matching records to reconcile
        doc_type = None
        reconciliation_matches: list[dict] = []
        if records:
            doc_type = records[0].get("document_type")

        # POST to Forecasto server
        api_client = ForecastoClient(
            base_url=self.config.server.base_url,
            api_key=self.config.server.api_key,
            agent_token=self.config.agent_token,
        )

        if doc_type in ("wire_transfer", "bank_statement"):
            for rec in records:
                amount = rec.get("total") or rec.get("amount")
                reference = rec.get("reference", "")
                if amount:
                    try:
                        matches = await api_client.search_payment_matches(
                            workspace_id=folder.workspace_id,
                            amount=abs(float(amount)),
                            reference=reference,
                        )
                        reconciliation_matches.extend(matches)
                    except Exception as e:
                        logger.warning("Payment match search failed: %s", e)

        try:
            item_id = await api_client.create_inbox_item(
                workspace_id=folder.workspace_id,
                source_path=str(path),
                source_filename=path.name,
                source_hash=file_hash,
                llm_provider=llm_cfg.provider,
                llm_model=llm_cfg.model,
                extracted_data=records,
                agent_version=AGENT_VERSION,
                document_type=doc_type,
                reconciliation_matches=reconciliation_matches if reconciliation_matches else None,
            )

            file_cache.mark_sent(str(path), file_hash, item_id)
            logger.info("Sent %s to inbox (item_id=%s, %d records)", path.name, item_id, len(records))

            if self.on_processed:
                self.on_processed(1)

        except Exception:
            logger.exception("Failed to send %s to server", path.name)
            file_cache.mark_error(str(path), file_hash)

    async def _notify_deleted(self, file_hash: str, workspace_id: str) -> None:
        api_client = ForecastoClient(
            base_url=self.config.server.base_url,
            api_key=self.config.server.api_key,
            agent_token=self.config.agent_token,
        )
        updated = await api_client.notify_source_deleted(
            workspace_id=workspace_id,
            source_hash=file_hash,
        )
        logger.info("Notified server of deleted file (hash=%s, updated=%d)", file_hash[:8], updated)
