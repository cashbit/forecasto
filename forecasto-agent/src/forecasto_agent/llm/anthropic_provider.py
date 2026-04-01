"""Anthropic Claude vision provider.

Uses tool_use to force structured JSON output — Claude fills in the
extract_financial_records tool, which defines the exact schema we need.
"""

from __future__ import annotations

import json
import logging
import os

import anthropic

from .base import LLMProvider

logger = logging.getLogger(__name__)

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
                            "description": "Cost/revenue CATEGORY (NOT the company name). E.g.: Consulenze, Hardware, Utenze, Affitti, Personale, Marketing. Short Italian noun.",
                        },
                        "reference": {
                            "type": "string",
                            "description": "Counterpart name + document identifier. E.g.: 'Acme SRL — Fattura 123/2026'. Combine supplier/client name with invoice number.",
                        },
                        "transaction_id": {
                            "type": "string",
                            "description": (
                                "Document type + number + year in Italian. E.g.: 'Fattura 1/2026', "
                                "'Nota credito 5/2026', 'Parcella 3/2026', 'Ricevuta 42/2026'. "
                                "Use full Italian type name (not abbreviations). Always include 4-digit year."
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
                        "date_offer":    {"type": "string", "description": "Document/order date YYYY-MM-DD."},
                        "date_cashflow": {
                            "type": "string",
                            "description": "Expected payment date YYYY-MM-DD. Calculate from payment terms if stated (e.g. 30gg FM). Default: date_offer + 30 days.",
                        },
                        "amount":        {"type": "number", "description": "Net amount excl. VAT. Negative=expense, positive=income."},
                        "vat":           {"type": "number", "description": "VAT amount. Negative=expense, positive=income. 0 if N/A."},
                        "vat_deduction": {"type": "number", "description": "VAT deductibility percentage (0-100). Default 100."},
                        "total":         {"type": "number", "description": "amount + vat."},
                        "stage":         {"type": "string", "enum": ["0", "1"], "description": "'0'=unpaid, '1'=paid."},
                        "project_code":  {"type": "string", "description": "Project code if mentioned."},
                        "withholding_rate": {"type": "number", "description": "Withholding tax rate % if applicable."},
                        "document_type": {
                            "type": "string",
                            "enum": ["invoice", "quote", "bank_statement", "wire_transfer", "receipt", "credit_note", "other"],
                            "description": (
                                "Classify the document: 'invoice'=fattura, 'quote'=offerta/preventivo, "
                                "'bank_statement'=estratto conto bancario (multiple transactions), "
                                "'wire_transfer'=contabile di bonifico/ricevuta di pagamento (single payment), "
                                "'receipt'=ricevuta/scontrino, 'credit_note'=nota di credito, 'other'=altro."
                            ),
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


class AnthropicProvider(LLMProvider):
    def __init__(self, model: str, api_key: str | None = None):
        self.model = model
        self.client = anthropic.AsyncAnthropic(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        )

    async def extract_records(
        self,
        image_blocks: list[dict],
        system_prompt: str,
        user_prompt: str,
    ) -> list[dict]:
        content: list[dict] = list(image_blocks)
        user_text = user_prompt.strip() or "Extract all financial records from this document."
        content.append({"type": "text", "text": user_text})

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            tools=[EXTRACT_TOOL],
            tool_choice={"type": "tool", "name": "extract_financial_records"},
            messages=[{"role": "user", "content": content}],
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "extract_financial_records":
                return block.input.get("records", [])

        logger.warning("No tool_use block in Anthropic response")
        return []
