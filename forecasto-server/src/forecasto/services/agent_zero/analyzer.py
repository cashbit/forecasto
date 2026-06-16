"""LLM analyzer: read the text a user wrote after an `@zero` tag in a record's
note and split it into "cose da ricordare" (reminders) and "criticità"
(criticalities). `nextaction` and `owner` are passed only as context to help
interpret the tagged text — they are NOT emitted as output.
"""

from __future__ import annotations

import json
import logging
from datetime import date

import anthropic

from forecasto.config import settings
from forecasto.models.record import Record

logger = logging.getLogger(__name__)

ZERO_TAG = "@zero"


def extract_zero_text(note: str | None) -> str:
    """Return the text that follows the first `@zero` tag (case-insensitive)."""
    if not note:
        return ""
    idx = note.lower().find(ZERO_TAG)
    if idx == -1:
        return ""
    return note[idx + len(ZERO_TAG):].strip()


SYSTEM_PROMPT = """Sei "Agente-zero", un assistente che analizza i record finanziari/commerciali di Forecasto.
Per OGNI record ricevi un campo `istruzioni`: è il testo (in italiano) che l'utente ha scritto dopo il tag @zero nelle note del record. Quel testo è ciò che devi interpretare.
Ricevi anche del contesto (prossima azione, owner/responsabile, conto, riferimento, importo, date): usalo SOLO per interpretare meglio le istruzioni, NON produrre output a partire dal contesto.

Dividi il contenuto delle `istruzioni` in due liste, in italiano:

1. reminders ("cose da ricordare"): promemoria, scadenze, cose da non dimenticare. Per ognuna `text` conciso e, se nel testo è indicata o deducibile una data, `due_date` in formato YYYY-MM-DD.
2. criticalities ("criticità"): elementi che risultano BLOCCANTI per incassare, fatturare o portare a casa un ordine (es. contratto non firmato, documento mancante, contestazione, attesa di approvazione, condizione non soddisfatta).

Regole:
- Considera solo le `istruzioni`. Se una delle due liste non ha contenuto, restituiscila vuota.
- Non inventare informazioni non presenti nel testo.
- Sii sintetico: ogni voce su una riga.
Restituisci SEMPRE il risultato chiamando lo strumento `extract_insights`, con una entry per ciascun record_id ricevuto."""

EXTRACT_TOOL = {
    "name": "extract_insights",
    "description": "Restituisce gli insight estratti per ciascun record.",
    "input_schema": {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "record_id": {"type": "string"},
                        "reminders": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "text": {"type": "string"},
                                    "due_date": {
                                        "type": "string",
                                        "description": "YYYY-MM-DD se presente o deducibile",
                                    },
                                },
                                "required": ["text"],
                            },
                        },
                        "criticalities": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"text": {"type": "string"}},
                                "required": ["text"],
                            },
                        },
                    },
                    "required": ["record_id", "reminders", "criticalities"],
                },
            }
        },
        "required": ["results"],
    },
}


def _record_payload(record: Record) -> dict:
    """Compact representation handed to the LLM: tagged instructions + context."""
    return {
        "record_id": record.id,
        "istruzioni": extract_zero_text(record.note),
        # context only
        "nextaction": record.nextaction or "",
        "owner": record.owner or "",
        "account": record.account,
        "reference": record.reference,
        "amount": str(record.amount),
        "date_cashflow": record.date_cashflow.isoformat() if record.date_cashflow else None,
        "review_date": record.review_date.isoformat() if record.review_date else None,
    }


async def analyze_records(records: list[Record]) -> tuple[dict[str, dict], dict]:
    """Analyze a batch of records.

    Returns (insights_by_record_id, usage_dict). `usage_dict` has
    input_tokens / output_tokens / model. Raises on API error.
    """
    if not records:
        return {}, {"input_tokens": 0, "output_tokens": 0, "model": settings.agent_zero_model}

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key or None)
    payload = [_record_payload(r) for r in records]
    user_text = (
        f"Oggi è {date.today().isoformat()}.\n"
        f"Interpreta le `istruzioni` di questi {len(payload)} record:\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    response = await client.messages.create(
        model=settings.agent_zero_model,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        tools=[EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_insights"},
        messages=[{"role": "user", "content": user_text}],
    )

    results: list[dict] = []
    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_insights":
            block_input = block.input if isinstance(block.input, dict) else {}
            results = block_input.get("results", []) or []
            break

    insights_by_id: dict[str, dict] = {}
    for item in results:
        rid = item.get("record_id")
        if not rid:
            continue
        insights_by_id[rid] = {
            "reminders": [
                {"text": r["text"], **({"due_date": r["due_date"]} if r.get("due_date") else {})}
                for r in (item.get("reminders") or [])
                if isinstance(r, dict) and r.get("text")
            ],
            "criticalities": [
                {"text": c["text"]}
                for c in (item.get("criticalities") or [])
                if isinstance(c, dict) and c.get("text")
            ],
        }

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "model": settings.agent_zero_model,
    }
    return insights_by_id, usage
