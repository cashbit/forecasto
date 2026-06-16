"""Source hash over the record fields Agente-zero actually reads.

If only an unrelated field changes (e.g. bank_account_id), the hash is stable
and we skip the LLM call — bumping `agent_analyzed_at` only.
"""

from __future__ import annotations

import hashlib

from forecasto.models.record import Record

# The fields whose changes warrant re-analysis. Order matters for the hash.
ANALYZED_FIELDS = (
    "area",
    "stage",
    "account",
    "reference",
    "note",
    "nextaction",
    "owner",
    "review_date",
    "date_cashflow",
    "amount",
)


def compute_source_hash(record: Record) -> str:
    """Stable sha256 of the analyzed fields of a record."""
    parts: list[str] = []
    for field in ANALYZED_FIELDS:
        value = getattr(record, field, None)
        parts.append("" if value is None else str(value))
    canonical = "".join(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
