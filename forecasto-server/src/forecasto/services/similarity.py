"""Multi-field similarity scoring for record matching.

Pure functions (no DB access) that compute similarity between
a candidate record from the database and a query from a new document.
"""

from __future__ import annotations

import re
from typing import Literal

from rapidfuzz import fuzz

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


def _normalize_reference(ref: str) -> str:
    """Canonicalize a company/person name to a lowercase, suffix-stripped string."""
    text = _COMPANY_SUFFIXES.sub("", ref.lower())
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _reference_similarity(a: str, b: str) -> float:
    """Fuzzy similarity over canonical reference strings (0-1).

    Uses rapidfuzz token_set_ratio as the main score (order-independent,
    robust to typos, suffix variations, OCR noise). Falls back to
    partial_ratio for the abbreviation case ("M. Rossi" / "Mario Rossi")
    but ONLY when (a) one string is meaningfully shorter than the other
    AND (b) at least one meaningful token is shared. The shared-token
    guard avoids inflating scores between unrelated short strings like
    "Ciari Lavorazioni" / "Alongi Patrizia" that partial_ratio would
    otherwise score around 0.45 from accidental substring overlaps.
    """
    if not a or not b:
        return 0.0
    canon_a = _normalize_reference(a)
    canon_b = _normalize_reference(b)
    if not canon_a or not canon_b:
        return 0.0
    if canon_a == canon_b:
        return 1.0
    token_score = fuzz.token_set_ratio(canon_a, canon_b) / 100.0
    short_len = min(len(canon_a), len(canon_b))
    long_len = max(len(canon_a), len(canon_b))
    if long_len > 0 and short_len / long_len <= 0.6:
        tokens_a = {t for t in canon_a.split() if len(t) > 2}
        tokens_b = {t for t in canon_b.split() if len(t) > 2}
        if tokens_a & tokens_b:
            partial_score = fuzz.partial_ratio(canon_a, canon_b) / 100.0
            return max(token_score, partial_score * 0.9)
    return token_score


def _normalize_vat(vat: str | None) -> str:
    """Strip non-alphanumeric, uppercase. 'IT 01234567890' → 'IT01234567890'."""
    if not vat:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", vat).upper()


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


def _amount_similarity(a: float, b: float, is_payment_doc: bool = False) -> float:
    """Compute amount similarity. Returns 0-1.

    Two curves:

    - **Commercial documents** (quote/invoice/credit_note/receipt/other):
      generous, because offer versions and invoice amendments legitimately
      shift the totals. 1.0 within 1%, 0.5 at 10%, 0.0 above ~25%.

    - **Payment documents** (wire_transfer/bank_statement): strict and
      sign-aware. A bank credit (positive) cannot reconcile against an
      outgoing record (negative) and vice versa — opposite signs mean
      opposite cashflow directions, which is never a real match.
      1.0 within ~€2 / 1%, drops sharply, 0.0 above 5%.
    """
    if a == 0 and b == 0:
        return 1.0
    max_val = max(abs(a), abs(b))
    if max_val == 0:
        return 0.0
    if is_payment_doc and a != 0 and b != 0 and (a > 0) != (b > 0):
        # Sign mismatch — incoming vs outgoing. Hard zero.
        return 0.0
    diff_abs = abs(abs(a) - abs(b))
    diff_pct = diff_abs / max_val
    if is_payment_doc:
        # Allow a fixed €2 slack on top of percentage to absorb rounding /
        # cents-only fee variations on small bonifici.
        if diff_abs <= 2.0 or diff_pct <= 0.01:
            return 1.0
        if diff_pct <= 0.02:
            return 0.85
        if diff_pct <= 0.05:
            return 0.5
        return 0.0
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
    "credit_note": ["actual", "orders", "prospect"],
    # Payment-style documents now also search orders/prospect: a wire transfer
    # often closes an open order that was prospected/ordered earlier. The
    # confirmation step then promotes the matched record to actual + stage=1.
    "wire_transfer": ["actual", "orders", "prospect"],
    "bank_statement": ["actual", "orders", "prospect"],
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


def _extract_counterpart_vat(record_like: dict) -> str:
    """Read counterpart VAT from a record/query dict. Handles flat or nested
    `classification.counterpart_vat`."""
    direct = record_like.get("counterpart_vat")
    if direct:
        return _normalize_vat(direct)
    classification = record_like.get("classification") or {}
    if isinstance(classification, dict):
        return _normalize_vat(classification.get("counterpart_vat"))
    return ""


def compute_similarity_score(
    candidate: dict,
    query: dict,
    document_type: str | None = None,
) -> tuple[float, list[str], Literal["payment", "update", "update_partial", "duplicate"]]:
    """Compute similarity between a candidate record and a query.

    Args:
        candidate: dict with keys reference, account, total, transaction_id, note, stage, area
            and optionally `counterpart_vat` or `classification.counterpart_vat`.
        query: dict with same keys (from extracted document)
        document_type: the incoming document type

    Returns:
        (score, reasons, match_type) where:
        - score: 0.0 to 1.0
        - reasons: list of Italian explanation strings
        - match_type: one of "payment", "update", "update_partial", "duplicate"
    """
    scores: dict[str, float] = {}
    reasons: list[str] = []

    # 1. Reference similarity (rapidfuzz token_set_ratio). When both sides
    # carry a P.IVA and it matches exactly, the counterparts are the same
    # legal entity regardless of name variation — override to 1.0.
    cand_vat = _extract_counterpart_vat(candidate)
    query_vat = _extract_counterpart_vat(query)
    vat_match = bool(cand_vat and query_vat and cand_vat == query_vat)

    if vat_match:
        ref_sim = 1.0
        reasons.append("stessa P.IVA")
    else:
        ref_sim = _reference_similarity(
            candidate.get("reference", ""), query.get("reference", "")
        )
        if ref_sim >= 0.85:
            reasons.append("riferimento corrispondente")
        elif ref_sim >= 0.6:
            reasons.append("riferimento simile")
    scores["reference"] = ref_sim

    # Hard gates for payment documents (wire_transfer / bank_statement).
    # A bonifico or bank line is only a real match if BOTH hold:
    #   (a) counterpart name aligns (or P.IVA matches exactly)
    #   (b) cashflow direction matches (same sign on amount)
    # Without these, amount + account similarity alone produces confident-
    # looking junk matches between unrelated counterparties that happen to
    # share a round number — and Rossi-credit-to-Rossi-debit confusions.
    is_payment_doc = document_type in ("wire_transfer", "bank_statement")
    if is_payment_doc:
        # Gate threshold 0.5 (not 0.4): rapidfuzz token_set_ratio on short
        # unrelated strings still scores ~0.40-0.43 from accidental character
        # overlap (e.g. "CIARI" vs "ALONGI PATRIZIA" = 0.40, "SABINI" vs
        # "BONIFICO" = 0.43). Real matches almost always score >= 0.7.
        if not vat_match and ref_sim < 0.5:
            return 0.0, [], "duplicate"
        try:
            cand_amt = float(candidate.get("amount") or candidate.get("total") or 0)
            qry_amt = float(query.get("amount") or query.get("total") or 0)
            if cand_amt != 0 and qry_amt != 0 and (cand_amt > 0) != (qry_amt > 0):
                return 0.0, [], "duplicate"
        except (ValueError, TypeError):
            pass

    # 2. Account match
    acc_a = (candidate.get("account") or "").lower().strip()
    acc_b = (query.get("account") or "").lower().strip()
    if acc_a and acc_b:
        scores["account"] = 1.0 if acc_a == acc_b else 0.0
        if acc_a == acc_b:
            reasons.append("stessa categoria conto")
    else:
        scores["account"] = 0.0

    # 3. Amount similarity (compare imponibile/net amount, fallback to total).
    # is_payment_doc was computed above for the reference gate.
    try:
        amt_a = float(candidate.get("amount") or candidate.get("total") or 0)
        amt_b = float(query.get("amount") or query.get("total") or 0)
    except (ValueError, TypeError):
        amt_a, amt_b = 0.0, 0.0
    amt_sim = _amount_similarity(amt_a, amt_b, is_payment_doc=is_payment_doc)
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

    # Determine match_type. is_payment_doc was set above when we computed amt_sim.
    # "payment" requires BOTH amount and counterpart name to align — amount alone
    # is not enough (see Alongi/Ciari false positive that motivated this rule).
    if (
        is_payment_doc
        and amt_sim >= 0.9
        and ref_sim >= 0.5
        and candidate.get("stage") == "0"
    ):
        match_type: Literal["payment", "update", "update_partial", "duplicate"] = "payment"
    elif (
        is_payment_doc
        and ref_sim >= 0.6
        and amt_sim < 0.9
        and candidate.get("stage") == "0"
    ):
        # bonifico that closes an open order/prospect with mismatched total —
        # caller resolves it in confirm_item by recomputing imponibile from total.
        match_type = "update_partial"
        reasons.append("probabile pagamento parziale o saldo")
    elif ref_sim >= 0.6 and (scores.get("transaction_id", 0) >= 0.3 or amt_sim >= 0.5):
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
