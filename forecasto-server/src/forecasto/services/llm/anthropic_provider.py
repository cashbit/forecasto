"""Server-side Anthropic Claude vision provider.

Returns (records, usage) tuple so token counts are captured for billing.
"""

from __future__ import annotations

import logging
import os
from typing import Callable

import anthropic

logger = logging.getLogger(__name__)

# Same tool schema as the agent — defines the structured extraction format
EXTRACT_TOOL = {
    "name": "extract_financial_records",
    "description": "Extract financial records from the document",
    "input_schema": {
        "type": "object",
        "properties": {
            "records": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "area": {
                            "type": "string",
                            "enum": ["actual", "orders", "prospect", "budget"],
                            "description": "Transaction area. Use 'actual' for invoices/receipts.",
                        },
                        "type": {
                            "type": "string",
                            "description": "Record type: Fornitori, Clienti, Dipendenti, Utenze, Affitti, Banche, Tasse, Altro.",
                        },
                        "account": {
                            "type": "string",
                            "description": "Cost/revenue CATEGORY (NOT the company name). E.g.: Consulenze, Hardware, Utenze, Affitti, Personale, Marketing.",
                        },
                        "reference": {
                            "type": "string",
                            "description": "Counterpart NAME only — company or person. E.g.: 'Italtronic S.r.l.', 'Mario Rossi'. Do NOT include document numbers or dates here.",
                        },
                        "transaction_id": {
                            "type": "string",
                            "description": (
                                "Document type + number + year in Italian. E.g.: 'Fattura 1/2026', "
                                "'Nota credito 5/2026', 'Parcella 3/2026'. "
                                "Use full Italian type name. Always include 4-digit year."
                            ),
                        },
                        "note": {
                            "type": "string",
                            "description": (
                                "Concise description of the nature of the supply/service/transaction in Italian. "
                                "Include: what was purchased or sold, purpose/scope if inferable, "
                                "payment terms or period covered. 2-4 sentences. Never leave empty."
                            ),
                        },
                        "date_offer": {"type": "string", "description": "Offer/order date YYYY-MM-DD. When the deal/order originated."},
                        "date_document": {
                            "type": "string",
                            "description": "Document/invoice date YYYY-MM-DD. The date printed on the document itself (e.g. invoice date, credit note date). May differ from date_offer.",
                        },
                        "date_cashflow": {
                            "type": "string",
                            "description": "Expected payment date YYYY-MM-DD. Calculate from payment terms if stated. Default: date_document + 30 days (or date_offer + 30 if no date_document).",
                        },
                        "amount": {
                            "type": "number",
                            "description": (
                                "Net amount EXCLUDING VAT. Negative=expense, positive=income. "
                                "For payment tranches: calculate percentage on the COMPONENT price, NOT on the total document value. "
                                "Example: 50% of a €50,000 license = amount 25,000 (not 50,000). "
                                "Verify: sum of all tranche amounts for one component must equal the component net price."
                            ),
                        },
                        "vat": {"type": "number", "description": "VAT amount. Negative=expense, positive=income. 0 if N/A."},
                        "vat_deduction": {"type": "number", "description": "VAT deductibility % (0-100). Default 100."},
                        "total": {"type": "number", "description": "amount + vat. Must equal amount + vat exactly."},
                        "stage": {"type": "string", "enum": ["0", "1"], "description": "'0'=unpaid, '1'=paid."},
                        "project_code": {"type": "string", "description": "Project code if mentioned."},
                        "withholding_rate": {"type": "number", "description": "Withholding tax rate % if applicable."},
                        "document_type": {
                            "type": "string",
                            "enum": ["invoice", "quote", "bank_statement", "wire_transfer", "receipt", "credit_note", "other"],
                            "description": (
                                "Classify the document type. "
                                "For 'quote': if payment milestones/tranches are specified, create one record per tranche. "
                                "If recurring fees (annual/monthly) are included, create separate records. "
                                "For 'invoice': if payment terms specify installments (30/60/90 days), create one record per installment."
                            ),
                        },
                    },
                    "required": ["area", "type", "account", "reference",
                                 "date_offer", "date_cashflow", "amount", "vat", "total", "stage",
                                 "document_type"],
                },
            },
            "reasoning": {
                "type": "string",
                "description": (
                    "Spiegazione SINTETICA in italiano (3-8 frasi) di come hai elaborato il "
                    "documento. Tocca, dove pertinente: (1) come hai classificato il documento "
                    "(attivo/passivo, tipo); (2) come hai usato il CONTESTO WORKSPACE (P.IVA, "
                    "denominazione, conti) per decidere il punto di vista e il segno; "
                    "(3) come hai gestito le rate / milestone / canoni e perché hai prodotto "
                    "N record; (4) eventuali abbinamenti con i RECORD APERTI DEL WORKSPACE "
                    "e/o sospetti di duplicato; (5) assunzioni o ambiguità (es. data calcolata, "
                    "IVA dedotta al 22% di default). Non descrivere lo schema dei campi: spiega "
                    "le scelte fatte su QUESTO documento. Sarà mostrato nella GUI all'utente."
                ),
            },
        },
        "required": ["records"],
    },
}


async def extract_records_with_usage(
    image_blocks: list[dict],
    system_prompt: str,
    user_prompt: str,
    model: str = "claude-sonnet-4-6",
    api_key: str | None = None,
    text_content: str | None = None,
    extra_context_block: str | None = None,
    on_progress: Callable[..., None] | None = None,
) -> tuple[list[dict], dict, str]:
    """Call Anthropic API and return (records, usage_dict, reasoning).

    If text_content is provided, it's used as the message content instead of
    image_blocks (e.g. for pre-parsed XML invoices sent as structured text).

    extra_context_block, if provided, is prepended to the message content as a
    text block (used for the workspace's open-records list).

    usage_dict contains: input_tokens, output_tokens,
    cache_creation_input_tokens, cache_read_input_tokens
    reasoning is the LLM's free-text explanation of its extraction choices.
    """
    client = anthropic.AsyncAnthropic(
        api_key=api_key or None
    )

    content: list[dict] = []
    if extra_context_block:
        content.append({"type": "text", "text": extra_context_block})

    if text_content:
        # Text-only mode (e.g. parsed XML invoice data)
        content.append({"type": "text", "text": text_content})
    else:
        content.extend(image_blocks)
    user_text = user_prompt.strip() or "Extract all financial records from this document."
    content.append({"type": "text", "text": user_text})

    # Use streaming: Anthropic requires it for max_tokens that may exceed a 10-minute
    # wall clock. The stream helper accumulates deltas into a final Message identical
    # in shape to the non-streaming response.
    last_record_count = 0
    cumulative_output_tokens = 0
    async with client.messages.stream(
        model=model,
        max_tokens=32768,
        system=system_prompt,
        tools=[EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_financial_records"},
        messages=[{"role": "user", "content": content}],
    ) as stream:
        # The SDK's parsed-snapshot accumulation is unreliable for tool_use in
        # this version (snapshot stays {}), so we accumulate the raw partial_json
        # fragments ourselves and count records by looking for the first required
        # field of each record (`"area"`).
        partial_json = ""
        async for event in stream:
            et = getattr(event, "type", None)
            if et == "input_json":
                pj = getattr(event, "partial_json", "") or ""
                if pj:
                    partial_json += pj
                    rc = partial_json.count('"area"')
                    if rc != last_record_count:
                        last_record_count = rc
                        if on_progress is not None:
                            try:
                                on_progress(
                                    output_tokens=cumulative_output_tokens,
                                    partial_record_count=rc,
                                )
                            except Exception:
                                logger.debug("on_progress callback raised; ignoring", exc_info=True)
            elif et == "message_delta":
                usage_delta = getattr(event, "usage", None)
                if usage_delta is not None:
                    out = getattr(usage_delta, "output_tokens", None)
                    if isinstance(out, int):
                        cumulative_output_tokens = out
                        if on_progress is not None:
                            try:
                                on_progress(
                                    output_tokens=out,
                                    partial_record_count=last_record_count,
                                )
                            except Exception:
                                logger.debug("on_progress callback raised; ignoring", exc_info=True)
        response = await stream.get_final_message()

    # Extract records and reasoning from tool_use block
    records: list[dict] = []
    reasoning: str = ""
    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_financial_records":
            block_input = block.input if isinstance(block.input, dict) else {}
            records = block_input.get("records", []) or []
            reasoning = block_input.get("reasoning", "") or ""
            break

    if response.stop_reason == "max_tokens":
        logger.warning(
            "Anthropic response truncated by max_tokens (model=%s, records=%d). "
            "Increase max_tokens or shorten the prompt.",
            model, len(records),
        )
        truncation_note = (
            "⚠️ Risposta troncata dal limite di token. "
            "Alcune righe potrebbero non essere state estratte — "
            "ripeti l'elaborazione o spezza il documento."
        )
        reasoning = (
            f"{truncation_note}\n\n{reasoning}" if reasoning else truncation_note
        )

    # Capture usage
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
    }

    return records, usage, reasoning
