"""Multi-field similarity scoring for record matching.

Pure functions (no DB access) that compute similarity between
a candidate record from the database and a query from a new document.
"""

from __future__ import annotations

import re
from typing import Literal

# Italian stop words for note comparison
_STOP_WORDS = frozenset(
    "il lo la i gli le un uno una di del dello della dei degli delle "
    "in con su per tra fra da a al allo alla ai agli alle dal dallo dalla "
    "dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui "
    "sugli sulle e o ma che non si è ha sono ho ed anche più".split()
)

# Company suffix patterns to strip for reference normalization
_COMPANY_SUFFIXES = re.compile(
    r"\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?c\.?a\.?r\.?l\.?|"
    r"srl|spa|sas|snc|scarl|unipersonale|ltd|gmbh|inc|corp)\b",
    re.IGNORECASE,
)


def _normalize_reference(ref: str) -> set[str]:
    """Normalize a company/person name to a set of lowercase tokens."""
    text = _COMPANY_SUFFIXES.sub("", ref.lower())
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = {t for t in text.split() if len(t) > 1}
    return tokens


def _jaccard(a: set[str], b: set[str]) -> float:
    """Jaccard similarity between two token sets."""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union > 0 else 0.0


def _extract_doc_number(tid: str) -> tuple[str | None, str | None]:
    """Extract document number and year from transaction_id.

    "Fattura 1/2026" → ("1", "2026")
    "Offerta V2 1/2026 (tranche 1/3)" → ("1", "2026")
    """
    if not tid:
        return None, None
    # Match patterns like "N/YYYY" or "N / YYYY"
    m = re.search(r"(\d+)\s*/\s*(\d{4})", tid)
    if m:
        return m.group(1), m.group(2)
    return None, None


def _amount_similarity(a: float, b: float) -> float:
    """Compute amount similarity. Returns 0-1.

    1.0 if within 1%, 0.5 at 10% diff, 0.0 at 25%+ diff.
    """
    if a == 0 and b == 0:
        return 1.0
    max_val = max(abs(a), abs(b))
    if max_val == 0:
        return 0.0
    diff_pct = abs(abs(a) - abs(b)) / max_val
    if diff_pct <= 0.01:
        return 1.0
    if diff_pct <= 0.05:
        return 0.9
    if diff_pct <= 0.10:
        return 0.5
    if diff_pct <= 0.20:
        return 0.2
    return 0.0


def _tokenize_note(note: str) -> set[str]:
    """Tokenize note text, removing stop words."""
    text = re.sub(r"[^\w\s]", " ", note.lower())
    return {t for t in text.split() if len(t) > 2 and t not in _STOP_WORDS}


# Weights for each field
WEIGHTS = {
    "reference": 0.30,
    "account": 0.15,
    "amount": 0.25,
    "transaction_id": 0.20,
    "note": 0.10,
}

# Area pipeline order
AREA_ORDER = {"budget": 0, "prospect": 1, "orders": 2, "actual": 3}

# Document type → target areas for search
SEARCH_AREAS: dict[str, list[str]] = {
    "quote": ["budget", "prospect"],
    "invoice": ["budget", "prospect", "orders", "actual"],
    "receipt": ["budget", "prospect", "orders", "actual"],
    "credit_note": ["actual", "orders"],
    "wire_transfer": ["actual"],
    "bank_statement": ["actual"],
    "other": ["budget", "prospect", "orders", "actual"],
}

# Document type → target area for transfer
TRANSFER_TARGET: dict[str, str] = {
    "quote": "prospect",
    "invoice": "actual",
    "receipt": "actual",
    "wire_transfer": "actual",
    "bank_statement": "actual",
    "credit_note": "actual",
    "other": "actual",
}


def get_search_areas(document_type: str | None) -> list[str]:
    """Return which areas to search for matching records."""
    return SEARCH_AREAS.get(document_type or "other", ["budget", "prospect", "orders", "actual"])


def compute_similarity_score(
    candidate: dict,
    query: dict,
    document_type: str | None = None,
) -> tuple[float, list[str], Literal["payment", "update", "duplicate"]]:
    """Compute similarity between a candidate record and a query.

    Args:
        candidate: dict with keys reference, account, total, transaction_id, note, stage, area
        query: dict with same keys (from extracted document)
        document_type: the incoming document type

    Returns:
        (score, reasons, match_type) where:
        - score: 0.0 to 1.0
        - reasons: list of Italian explanation strings
        - match_type: "payment", "update", or "duplicate"
    """
    scores: dict[str, float] = {}
    reasons: list[str] = []

    # 1. Reference similarity
    ref_a = _normalize_reference(candidate.get("reference", ""))
    ref_b = _normalize_reference(query.get("reference", ""))
    ref_sim = _jaccard(ref_a, ref_b)
    scores["reference"] = ref_sim
    if ref_sim >= 0.5:
        reasons.append("riferimento corrispondente")

    # 2. Account match
    acc_a = (candidate.get("account") or "").lower().strip()
    acc_b = (query.get("account") or "").lower().strip()
    if acc_a and acc_b:
        scores["account"] = 1.0 if acc_a == acc_b else 0.0
        if acc_a == acc_b:
            reasons.append("stessa categoria conto")
    else:
        scores["account"] = 0.0

    # 3. Amount similarity (compare imponibile/net amount, fallback to total)
    try:
        amt_a = float(candidate.get("amount") or candidate.get("total") or 0)
        amt_b = float(query.get("amount") or query.get("total") or 0)
    except (ValueError, TypeError):
        amt_a, amt_b = 0.0, 0.0
    amt_sim = _amount_similarity(amt_a, amt_b)
    scores["amount"] = amt_sim
    if amt_sim >= 0.9:
        reasons.append("importo corrispondente")
    elif amt_sim >= 0.5:
        diff_pct = abs(abs(amt_a) - abs(amt_b)) / max(abs(amt_a), abs(amt_b), 1) * 100
        reasons.append(f"importo simile (~{diff_pct:.0f}%)")

    # 4. Transaction ID similarity
    tid_a = candidate.get("transaction_id") or ""
    tid_b = query.get("transaction_id") or ""
    num_a, year_a = _extract_doc_number(tid_a)
    num_b, year_b = _extract_doc_number(tid_b)
    if num_a and num_b and year_a == year_b:
        scores["transaction_id"] = 1.0 if num_a == num_b else 0.3
        if num_a == num_b:
            reasons.append("stesso ID transazione")
        else:
            reasons.append("ID transazione simile")
    elif tid_a and tid_b:
        # Fallback: token overlap
        tid_sim = _jaccard(set(tid_a.lower().split()), set(tid_b.lower().split()))
        scores["transaction_id"] = tid_sim
        if tid_sim > 0.3:
            reasons.append("ID transazione simile")
    else:
        scores["transaction_id"] = 0.0

    # 5. Note similarity
    note_a = _tokenize_note(candidate.get("note") or "")
    note_b = _tokenize_note(query.get("note") or "")
    note_sim = _jaccard(note_a, note_b)
    scores["note"] = note_sim
    if note_sim > 0.3:
        reasons.append("note simili")

    # Weighted total
    total_score = sum(scores[k] * WEIGHTS[k] for k in WEIGHTS)

    # Determine match_type
    is_payment_doc = document_type in ("wire_transfer", "bank_statement")
    if is_payment_doc and amt_sim >= 0.9 and candidate.get("stage") == "0":
        match_type: Literal["payment", "update", "duplicate"] = "payment"
    elif ref_sim >= 0.5 and (scores.get("transaction_id", 0) >= 0.3 or amt_sim >= 0.5):
        match_type = "update"
    else:
        match_type = "duplicate"

    return total_score, reasons, match_type


def get_suggested_transfer_area(
    document_type: str | None,
    current_area: str,
) -> str | None:
    """Suggest which area to transfer a record to, based on document type.

    Returns None if no transfer is needed (record already in target area or beyond).
    """
    target = TRANSFER_TARGET.get(document_type or "other")
    if not target:
        return None

    current_order = AREA_ORDER.get(current_area, 0)
    target_order = AREA_ORDER.get(target, 0)

    if target_order > current_order:
        return target
    return None
