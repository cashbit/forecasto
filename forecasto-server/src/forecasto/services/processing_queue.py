"""Background processing queue for document uploads.

Runs as part of the FastAPI lifespan — workers are started when the app starts
and process documents from an asyncio queue with bounded concurrency.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.config import settings
from forecasto.database import async_session_maker
from forecasto.models.document_processing import (
    DocumentProcessingJob,
    LLMPricingConfig,
    UsageRecord,
)
from forecasto.models.inbox import InboxItem
from forecasto.models.workspace import Workspace
from forecasto.schemas.inbox import InboxItemCreate, RecordSuggestion
from forecasto.services.event_bus import event_bus

logger = logging.getLogger(__name__)

# Default system prompt (same as agent's DEFAULT_SYSTEM_PROMPT)
DEFAULT_SYSTEM_PROMPT = """\
You are a financial document processor for Forecasto, an Italian cash-flow management tool.
Extract all financial transactions from the provided document and return structured records.

FIELD DEFINITIONS — read carefully:

- area: one of "actual" (real transactions), "orders" (confirmed orders), "prospect" (expected), "budget"
  Default: "actual" for invoices/receipts, "orders" for purchase orders.

- type: the record type in Forecasto. Use one of: "Fornitori", "Clienti", "Dipendenti",
  "Utenze", "Affitti", "Banche", "Tasse", "Altro". Choose the one that best matches the document.

- account: the COST CATEGORY or account label (e.g. "Consulenze", "Hardware", "Utenze", "Affitti",
  "Personale", "Marketing"). This is NOT the counterpart company name — it is the cost/revenue category.
  Use a short, generic Italian noun that classifies the expense or income.

- reference: the COUNTERPART NAME and/or document identifier, e.g. "Acme SRL — Fattura 123/2026"
  or "Mario Rossi — Parcella marzo 2026". Combine supplier/client name with invoice number.

- transaction_id: document type, number and date in Italian, e.g. "Fattura 1/2026",
  "Nota credito 5/2026", "Parcella 3/2026", "Ricevuta 42/2026".
  Use the full Italian document type name (not abbreviations like FT or FPR).
  Include the year as 4 digits. Do NOT leave this empty.

- date_offer: document/order date as YYYY-MM-DD.

- date_cashflow: expected payment or cash movement date as YYYY-MM-DD.
  Calculate from payment terms if stated. If not stated, default to date_offer + 30 days.

- amount: net amount excluding VAT. Negative for expenses/costs, positive for income/revenue.

- vat: VAT (IVA) amount. Negative for expenses, positive for income. 0 if not applicable.

- total: amount + vat (must equal amount + vat exactly).

- stage: "0" if not yet paid/invoiced, "1" if already paid/settled.

- note: a concise but informative description of the nature of the supply, service or transaction.
  Include: what was purchased/sold, the scope/purpose if inferable, any relevant conditions.
  Write in Italian. 2-4 sentences max. Do NOT leave this empty.

- document_type: classify the document as one of:
  "invoice", "quote", "bank_statement", "wire_transfer", "receipt", "credit_note", "other"
  For bank_statement and wire_transfer, stage should be "1" and area should be "actual".

Return a valid JSON array of records. Extract ALL transactions found in the document.
"""


class ProcessingQueue:
    """Singleton — global document processing queue with bounded concurrency."""

    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._running = False
        self._workers: list[asyncio.Task] = []
        self._processing_count = 0

    @property
    def queued_count(self) -> int:
        return self._queue.qsize()

    @property
    def processing_count(self) -> int:
        return self._processing_count

    async def start(self) -> None:
        """Start worker tasks. Called during FastAPI lifespan startup."""
        self._running = True
        max_workers = settings.processing_max_concurrent
        for i in range(max_workers):
            task = asyncio.create_task(self._worker(i))
            self._workers.append(task)
        logger.info("Processing queue started with %d workers", max_workers)

    async def stop(self) -> None:
        """Stop all workers. Called during FastAPI lifespan shutdown."""
        self._running = False
        for task in self._workers:
            task.cancel()
        self._workers.clear()
        logger.info("Processing queue stopped")

    async def enqueue(self, job_id: str) -> int:
        """Add a job to the queue. Returns queue position."""
        if self._queue.qsize() >= settings.processing_max_queue_size:
            raise QueueFullError(
                f"Processing queue is full ({settings.processing_max_queue_size} jobs)"
            )
        await self._queue.put(job_id)
        return self._queue.qsize()

    async def _worker(self, worker_id: int) -> None:
        """Worker loop — pulls jobs from queue and processes them."""
        logger.debug("Worker %d started", worker_id)
        while self._running:
            try:
                job_id = await asyncio.wait_for(self._queue.get(), timeout=2.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            self._processing_count += 1
            try:
                await self._process_job(job_id)
            except Exception:
                logger.exception("Worker %d: unhandled error processing job %s", worker_id, job_id)
            finally:
                self._processing_count -= 1
                self._queue.task_done()

    async def _process_job(self, job_id: str) -> None:
        """Process a single document — runs in worker context with own DB session."""
        async with async_session_maker() as db:
            try:
                # Load job
                result = await db.execute(
                    select(DocumentProcessingJob).where(DocumentProcessingJob.id == job_id)
                )
                job = result.scalar_one_or_none()
                if not job:
                    logger.error("Job %s not found", job_id)
                    return

                if job.status != "queued":
                    logger.warning("Job %s has status %s, skipping", job_id, job.status)
                    return

                # Mark processing
                job.status = "processing"
                job.started_at = datetime.utcnow()
                await db.flush()
                await db.commit()

                # Read file from disk
                file_path = Path(job.file_storage_path)
                if not file_path.exists():
                    raise FileNotFoundError(f"Upload file missing: {file_path}")
                file_bytes = file_path.read_bytes()

                # Convert to vision blocks (CPU-bound → run in thread)
                image_blocks = await asyncio.to_thread(
                    _convert_to_images, file_bytes, job.file_content_type
                )

                # Load workspace for custom prompts
                ws_result = await db.execute(
                    select(Workspace).where(Workspace.id == job.workspace_id)
                )
                workspace = ws_result.scalar_one_or_none()
                doc_settings = (workspace.settings or {}).get("document_processing", {}) if workspace else {}
                system_prompt = doc_settings.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
                user_prompt = doc_settings.get("user_prompt", "")

                # Call Anthropic API
                from forecasto.services.llm.anthropic_provider import extract_records_with_usage

                records, usage = await extract_records_with_usage(
                    image_blocks=image_blocks,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    model=job.llm_model,
                    api_key=settings.anthropic_api_key or None,
                )

                # Free memory
                del image_blocks
                del file_bytes

                # Get document_type from first record
                doc_type = records[0].get("document_type") if records else None

                # Create InboxItem
                from forecasto.services.inbox_service import InboxService
                inbox_service = InboxService(db)

                inbox_data = InboxItemCreate(
                    source_path=job.file_storage_path,
                    source_filename=job.source_filename,
                    source_hash=job.source_hash,
                    llm_provider="anthropic",
                    llm_model=job.llm_model,
                    agent_version="server-1.0",
                    extracted_data=[RecordSuggestion(**r) for r in records],
                    document_type=doc_type,
                )
                inbox_item = await inbox_service.create_item(
                    workspace_id=job.workspace_id, data=inbox_data
                )

                # Calculate costs
                pricing = await _get_pricing(db, job.llm_model)
                input_cost = usage["input_tokens"] * pricing["input_price"] / 1_000_000
                output_cost = usage["output_tokens"] * pricing["output_price"] / 1_000_000
                total_cost = input_cost + output_cost
                multiplier = pricing["multiplier"]

                # Create usage record
                usage_rec = UsageRecord(
                    workspace_id=job.workspace_id,
                    job_id=job.id,
                    user_id=job.uploaded_by_user_id,
                    llm_provider="anthropic",
                    llm_model=job.llm_model,
                    input_tokens=usage["input_tokens"],
                    output_tokens=usage["output_tokens"],
                    cache_creation_tokens=usage.get("cache_creation_input_tokens", 0),
                    cache_read_tokens=usage.get("cache_read_input_tokens", 0),
                    input_cost_usd=round(input_cost, 6),
                    output_cost_usd=round(output_cost, 6),
                    total_cost_usd=round(total_cost, 6),
                    billed_cost_usd=round(total_cost * multiplier, 6),
                    multiplier=multiplier,
                )
                db.add(usage_rec)

                # Complete job
                job.status = "completed"
                job.inbox_item_id = inbox_item.id
                job.completed_at = datetime.utcnow()
                await db.commit()

                logger.info(
                    "Job %s completed: %d records, %d input + %d output tokens, $%.4f billed",
                    job_id, len(records), usage["input_tokens"], usage["output_tokens"],
                    usage_rec.billed_cost_usd,
                )

                # Notify via SSE
                await event_bus.publish(
                    "inbox_changed",
                    workspace_id=job.workspace_id,
                    data={"action": "create", "item_id": inbox_item.id, "job_id": job.id},
                )

            except Exception as e:
                logger.exception("Job %s failed: %s", job_id, e)
                job.status = "failed"
                job.error_message = str(e)[:1000]
                job.completed_at = datetime.utcnow()
                await db.commit()


def _convert_to_images(file_bytes: bytes, content_type: str) -> list[dict]:
    """Convert file bytes to Anthropic vision blocks. Runs in a thread."""
    if content_type == "application/pdf":
        from forecasto.services.processors.pdf import pdf_bytes_to_base64_images
        return pdf_bytes_to_base64_images(file_bytes)
    else:
        from forecasto.services.processors.image import image_bytes_to_base64
        return [image_bytes_to_base64(file_bytes, content_type)]


async def _get_pricing(db: AsyncSession, model_name: str) -> dict:
    """Get pricing for a model, with fallback to default."""
    result = await db.execute(
        select(LLMPricingConfig).where(
            LLMPricingConfig.model_name == model_name,
            LLMPricingConfig.is_active == True,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        # Fallback to default
        result = await db.execute(
            select(LLMPricingConfig).where(LLMPricingConfig.is_default == True)
        )
        config = result.scalar_one_or_none()
    if config:
        return {
            "input_price": config.input_price_per_mtok,
            "output_price": config.output_price_per_mtok,
            "multiplier": config.multiplier,
        }
    # Hardcoded fallback
    return {"input_price": 3.0, "output_price": 15.0, "multiplier": 2.0}


class QueueFullError(Exception):
    pass


# Singleton instance
processing_queue = ProcessingQueue()
