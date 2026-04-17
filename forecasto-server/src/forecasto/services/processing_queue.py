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

- reference: the COUNTERPART NAME only — the company or person name on the other side of the transaction.
  Examples: "Italtronic S.r.l.", "SIAD Macchine Impianti S.p.A.", "Mario Rossi".
  Do NOT include document numbers, invoice references, or dates in this field.
  Those belong in the transaction_id field.

- transaction_id: document type, number and date in Italian, e.g. "Fattura 1/2026",
  "Nota credito 5/2026", "Parcella 3/2026", "Ricevuta 42/2026".
  Use the full Italian document type name (not abbreviations like FT or FPR).
  Include the year as 4 digits. Do NOT leave this empty.

- date_offer: offer/order date as YYYY-MM-DD. When the deal/order originated.

- date_document: document/invoice date as YYYY-MM-DD. The date printed on the document
  itself (e.g. invoice date, credit note date). May differ from date_offer.

- date_cashflow: expected payment or cash movement date as YYYY-MM-DD.
  Calculate from payment terms if stated. Default: date_document + 30 days (or date_offer + 30).

- amount: net amount excluding VAT (IMPONIBILE). This is the PRIMARY amount field.
  Negative for expenses/costs, positive for income/revenue.

- vat: VAT (IVA) amount. Negative for expenses, positive for income.
  If the document does NOT specify the VAT rate, use 22% as default (Italian standard rate).
  Calculate: vat = amount × 0.22 (or the rate specified in the document).
  Set to 0 only for VAT-exempt operations (esente IVA, fuori campo IVA, reverse charge).

- total: amount + vat (must equal amount + vat exactly). This is the IVA-inclusive amount.

- stage: "0" if not yet paid/invoiced, "1" if already paid/settled.

- note: a concise but informative description of the nature of the supply, service or transaction.
  Include: what was purchased/sold, the scope/purpose if inferable, any relevant conditions.
  Write in Italian. 2-4 sentences max. Do NOT leave this empty.

- document_type: classify the document as one of:
  "invoice", "quote", "bank_statement", "wire_transfer", "receipt", "credit_note", "other"
  For bank_statement and wire_transfer, stage should be "1" and area should be "actual".

SPLITTING IN TRANCHE E RATE DI PAGAMENTO:
Regola fondamentale: ogni movimento di cassa distinto = un record separato.

REGOLA CRITICA SUL CALCOLO IMPORTI:
Le percentuali di pagamento si applicano SEMPRE al prezzo della SINGOLA COMPONENTE,
MAI al totale complessivo del documento.
Esempio: se un'offerta ha Licenza €50.000 e Canone €20.000/anno:
  - "50% all'ordine" della licenza = 50% di €50.000 = €25.000 (NON 50% di €70.000)
  - "30% al go-live" della licenza = 30% di €50.000 = €15.000
  - "20% alla validazione" della licenza = 20% di €50.000 = €10.000
  - Canone annuale = €20.000 (importo intero, non frazionato)
Verifica: la somma delle tranche di ogni componente DEVE essere uguale al prezzo della componente.
I campi amount e total devono essere NETTI (senza IVA) rispettivamente e LORDI (con IVA).
amount = prezzo netto della tranche (IMPONIBILE). vat = amount × aliquota IVA (default 22%). total = amount + vat.
NON mettere il prezzo lordo in amount. Se il documento mostra solo l'imponibile, calcola vat = amount × 0.22 e total = amount + vat.

1. OFFERTE/PREVENTIVI con milestone di pagamento:
   - Prima identifica OGNI COMPONENTE separata con il suo prezzo (licenza, canone, servizi)
   - Poi per ogni componente che ha condizioni di pagamento, crea UN RECORD per ogni tranche
   - Calcola: importo_tranche_netto = prezzo_componente_netto * percentuale / 100
   - date_cashflow diversa per ogni tranche in base alla milestone
   - transaction_id: "Offerta X/YYYY (tranche N/M)"
   - note: descrivere quale milestone e componente

2. FATTURE con pagamento rateale (30/60/90 gg, ecc.):
   - Crea UN RECORD per ogni rata
   - Dividi l'importo totale della fattura in parti uguali (o come specificato)
   - date_cashflow: data fattura + 30gg, + 60gg, + 90gg rispettivamente
   - transaction_id: "Fattura X/YYYY (rata N/M)"

3. CONTRATTI con canoni ricorrenti (affitto, leasing, abbonamento):
   - Crea record separati: uno per eventuali costi una tantum, poi uno per ogni canone periodico
   - Per canoni mensili: un record per mese con date_cashflow scalate
   - Per canoni annuali: un record per anno
   - NON aggregare costo una tantum e canone ricorrente in un unico record

4. OFFERTE con componenti miste (licenza + canone):
   - Crea record separati per ogni componente: licenza una tantum, canone annuale, servizi
   - Se la licenza ha milestone di pagamento, applica anche regola 1
   - Verifica: somma tranche licenza = prezzo licenza. Canone = importo intero separato.

5. FATTURE con voci distinte:
   - Se le voci hanno nature diverse (servizi diversi, periodi diversi) -> record separati
   - Se le voci sono dello stesso servizio/fornitura -> un unico record aggregato

Return a valid JSON array of records. Extract ALL transactions found in the document.
"""


class ProcessingQueue:
    """Singleton — global document processing queue with bounded concurrency.

    Per-user serialization: only one document is processed at a time per user,
    so quota is checked and decremented atomically document-by-document.
    """

    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._running = False
        self._workers: list[asyncio.Task] = []
        self._processing_count = 0
        self._user_locks: dict[str, asyncio.Lock] = {}  # per-user serialization

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

    def _get_user_lock(self, user_id: str) -> asyncio.Lock:
        """Get or create a per-user lock for serialized processing."""
        if user_id not in self._user_locks:
            self._user_locks[user_id] = asyncio.Lock()
        return self._user_locks[user_id]

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
        """Process a single document — runs in worker context with own DB session.

        Per-user serialization ensures quota is checked atomically.
        """
        # First load the job to get the user_id for the lock
        async with async_session_maker() as db:
            result = await db.execute(
                select(DocumentProcessingJob).where(DocumentProcessingJob.id == job_id)
            )
            job_peek = result.scalar_one_or_none()
            if not job_peek:
                logger.error("Job %s not found", job_id)
                return
            user_id = job_peek.uploaded_by_user_id or "__no_user__"

        # Acquire per-user lock — only one document at a time per user
        user_lock = self._get_user_lock(user_id)
        async with user_lock:
            await self._process_job_inner(job_id, user_id)

    async def _process_job_inner(self, job_id: str, user_id: str) -> None:
        """Inner processing — called with per-user lock held."""
        from forecasto.models.user import User

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

                # --- Quota check (before any heavy processing) ---
                if user_id != "__no_user__":
                    user_result = await db.execute(select(User).where(User.id == user_id))
                    user = user_result.scalar_one_or_none()
                    if user and user.monthly_page_quota > 0:
                        from forecasto.services.document_processing_service import DocumentProcessingService
                        svc = DocumentProcessingService(db)
                        quota_info = await svc.get_user_monthly_usage(user_id)
                        if quota_info["pages_remaining"] <= 0:
                            job.status = "failed"
                            job.error_message = (
                                f"Limite mensile raggiunto: {user.monthly_page_quota} pagine/mese. "
                                f"Usate {quota_info['pages_this_month']} pagine questo mese."
                            )
                            job.completed_at = datetime.utcnow()
                            await db.commit()
                            logger.info("Job %s rejected: monthly quota exceeded", job_id)
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

                # Load workspace (needed for prompts and XML classification)
                ws_result = await db.execute(
                    select(Workspace).where(Workspace.id == job.workspace_id)
                )
                workspace = ws_result.scalar_one_or_none()
                doc_settings = (workspace.settings or {}).get("document_processing", {}) if workspace else {}
                system_prompt = doc_settings.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
                user_prompt = doc_settings.get("user_prompt", "")

                # Compose agent prompts (user-level + workspace-level)
                from forecasto.models.user import User as UserModel
                user_result = await db.execute(
                    select(UserModel).where(UserModel.id == job.uploaded_by_user_id)
                )
                upload_user = user_result.scalar_one_or_none()
                if upload_user and upload_user.agent_prompt:
                    system_prompt += "\n\n## Regole Generali Utente\n" + upload_user.agent_prompt
                ws_agent_prompt = (workspace.settings or {}).get("agent_prompt") if workspace else None
                if ws_agent_prompt:
                    system_prompt += "\n\n## Regole Specifiche Workspace\n" + ws_agent_prompt

                # --- XML/P7M branch: deterministic parsing + text-based LLM ---
                _XML_CONTENT_TYPES = {"application/xml", "text/xml"}
                _P7M_CONTENT_TYPES = {"application/pkcs7-mime", "application/x-pkcs7-mime"}

                text_content_for_llm: str | None = None

                if job.file_content_type in _XML_CONTENT_TYPES | _P7M_CONTENT_TYPES:
                    from forecasto.services.processors.sdi_xml import (
                        parse_sdi_xml,
                        classify_invoice,
                        format_invoice_for_llm,
                        extract_xml_from_p7m,
                        decode_xml_bytes,
                    )

                    # Extract XML from P7M or decode raw XML
                    if job.file_content_type in _P7M_CONTENT_TYPES:
                        xml_content = await asyncio.to_thread(extract_xml_from_p7m, file_bytes)
                    else:
                        xml_content = decode_xml_bytes(file_bytes)

                    invoice = parse_sdi_xml(xml_content, job.source_filename)

                    # Load workspace VAT number for classification
                    workspace_vat = ""
                    if workspace and workspace.vat_registry_id:
                        from forecasto.models.vat_registry import VatRegistry
                        vat_reg_result = await db.execute(
                            select(VatRegistry).where(VatRegistry.id == workspace.vat_registry_id)
                        )
                        vat_reg = vat_reg_result.scalar_one_or_none()
                        if vat_reg:
                            workspace_vat = vat_reg.vat_number or ""

                    classification = classify_invoice(invoice, workspace_vat)
                    text_content_for_llm = format_invoice_for_llm(invoice, classification)
                    page_count = 1
                    job.pages_processed = page_count
                    image_blocks = []

                    logger.info(
                        "Job %s: XML parsed (%s, %s %s, %d linee, %d rate) → sending to LLM as text",
                        job_id, invoice.tipo_documento, classification.direction,
                        classification.counterpart_name, len(invoice.linee_dettaglio), len(invoice.rate),
                    )
                else:
                    # --- Standard vision path (PDF/images) ---
                    image_blocks, page_count = await asyncio.to_thread(
                        _convert_to_images, file_bytes, job.file_content_type
                    )
                    job.pages_processed = page_count

                # --- Pre-flight page quota check (now that page_count is known) ---
                if user_id != "__no_user__":
                    from forecasto.services.document_processing_service import DocumentProcessingService
                    svc = DocumentProcessingService(db)
                    quota_info = await svc.get_user_monthly_usage(user_id)
                    if (
                        quota_info["monthly_page_quota"] > 0
                        and page_count > quota_info["pages_remaining"]
                    ):
                        job.status = "failed"
                        job.error_message = (
                            f"Documento di {page_count} pagine eccede la quota residua di "
                            f"{quota_info['pages_remaining']} pagine (quota mensile "
                            f"{quota_info['monthly_page_quota']}). Caricamento rifiutato."
                        )
                        job.pages_processed = 0
                        job.completed_at = datetime.utcnow()
                        await db.commit()
                        logger.info(
                            "Job %s rejected: %d pages > %d remaining",
                            job_id, page_count, quota_info["pages_remaining"],
                        )
                        return

                # Call Anthropic API
                from forecasto.services.llm.anthropic_provider import extract_records_with_usage

                records, usage = await extract_records_with_usage(
                    image_blocks=image_blocks,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    model=job.llm_model,
                    api_key=settings.anthropic_api_key or None,
                    text_content=text_content_for_llm,
                )

                # Free memory
                del image_blocks
                del file_bytes

                # Get document_type from first record
                doc_type = records[0].get("document_type") if records else None

                # Create InboxItem
                from forecasto.services.inbox_service import InboxService
                inbox_service = InboxService(db)

                # Find similar records PER ROW and auto-assign best match
                claimed_ids: set[str] = set()  # prevent same record matched to multiple rows
                for rec in records:
                    try:
                        matches = await inbox_service.find_similar_records(
                            workspace_id=job.workspace_id,
                            reference=rec.get("reference", ""),
                            account=rec.get("account", ""),
                            amount=rec.get("amount"),
                            transaction_id=rec.get("transaction_id"),
                            note=rec.get("note"),
                            document_type=doc_type,
                        )
                        # Filter out already-claimed records
                        available = [m for m in matches if m["record_id"] not in claimed_ids]
                        rec["similar_records"] = available
                        if available and available[0]["match_score"] >= 0.4:
                            rec["matched_record"] = available[0]
                            claimed_ids.add(available[0]["record_id"])
                        else:
                            rec["matched_record"] = None
                    except Exception as e:
                        logger.warning(f"Similarity search failed for record: {e}")
                        rec["similar_records"] = []
                        rec["matched_record"] = None

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
                    pages_processed=page_count,
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


def _convert_to_images(file_bytes: bytes, content_type: str) -> tuple[list[dict], int]:
    """Convert file bytes to Anthropic vision blocks. Runs in a thread.

    Returns (image_blocks, page_count).
    """
    if content_type == "application/pdf":
        from forecasto.services.processors.pdf import pdf_bytes_to_base64_images
        return pdf_bytes_to_base64_images(file_bytes)
    else:
        from forecasto.services.processors.image import image_bytes_to_base64
        return [image_bytes_to_base64(file_bytes, content_type)], 1


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
