"""Server-side Anthropic Claude vision provider.

Returns (records, usage) tuple so token counts are captured for billing.
"""

from __future__ import annotations

import logging
import os

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
                        "date_offer": {"type": "string", "description": "Document/order date YYYY-MM-DD."},
                        "date_cashflow": {
                            "type": "string",
                            "description": "Expected payment date YYYY-MM-DD. Calculate from payment terms if stated. Default: date_offer + 30 days.",
                        },
                        "amount": {"type": "number", "description": "Net amount excl. VAT. Negative=expense, positive=income."},
                        "vat": {"type": "number", "description": "VAT amount. Negative=expense, positive=income. 0 if N/A."},
                        "vat_deduction": {"type": "number", "description": "VAT deductibility % (0-100). Default 100."},
                        "total": {"type": "number", "description": "amount + vat."},
                        "stage": {"type": "string", "enum": ["0", "1"], "description": "'0'=unpaid, '1'=paid."},
                        "project_code": {"type": "string", "description": "Project code if mentioned."},
                        "withholding_rate": {"type": "number", "description": "Withholding tax rate % if applicable."},
                        "document_type": {
                            "type": "string",
                            "enum": ["invoice", "quote", "bank_statement", "wire_transfer", "receipt", "credit_note", "other"],
                            "description": "Classify the document type.",
                        },
                    },
                    "required": ["area", "type", "account", "reference",
                                 "date_offer", "date_cashflow", "amount", "vat", "total", "stage",
                                 "document_type"],
                },
            }
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
) -> tuple[list[dict], dict]:
    """Call Anthropic API and return (records, usage_dict).

    usage_dict contains: input_tokens, output_tokens,
    cache_creation_input_tokens, cache_read_input_tokens
    """
    client = anthropic.AsyncAnthropic(
        api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    )

    content: list[dict] = list(image_blocks)
    user_text = user_prompt.strip() or "Extract all financial records from this document."
    content.append({"type": "text", "text": user_text})

    response = await client.messages.create(
        model=model,
        max_tokens=4096,
        system=system_prompt,
        tools=[EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_financial_records"},
        messages=[{"role": "user", "content": content}],
    )

    # Extract records from tool_use block
    records = []
    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_financial_records":
            records = block.input.get("records", [])
            break

    # Capture usage
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
    }

    return records, usage
