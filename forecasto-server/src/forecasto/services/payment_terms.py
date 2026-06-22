"""Payment-terms parser — turn Italian shorthand into due dates.

Deterministic (no LLM) interpreter for the common Italian payment-term strings:

    "immediato" / "rimessa diretta" / "contanti" / "pronto cassa"  -> due on the invoice date
    "ricevimento fattura" / "rf"                                   -> due on the invoice date
    "30 gg" / "60 giorni"                                          -> invoice date + N days
    "30 gg fm" / "30 gg d.f. f.m."                                 -> invoice date + N days, then end of month
    "30/60/90 df fm"                                               -> three installments, each + N days (+ end of month)

Convention for "fine mese" (fm): add the days to the invoice date first, then
snap to the last day of that month ("data fattura fine mese"). Results are always
editable by the user, so this stays a sensible default rather than a hard rule.

Returns a list of installment dicts: ``{"days", "due_date" (ISO), "end_of_month", "label"}``.
"""

from __future__ import annotations

import calendar
import re
from datetime import date, timedelta

_IMMEDIATE_RE = re.compile(
    r"immediat|rimessa\s*diretta|contant|pronto\s*cassa|vista\s*fattura|\br\.?d\.?\b"
)
_RECEIPT_RE = re.compile(r"ricevimento\s*fattura|ric\.?\s*fatt|\br\.?f\.?\b")
_FINE_MESE_RE = re.compile(r"\bf\.?\s?m\.?\b|fine\s*mese")
_NUM_RE = re.compile(r"\d+")


def _end_of_month(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def parse_payment_terms(text: str | None, issue_date: date | None) -> list[dict]:
    """Parse a payment-terms string into installment due dates relative to
    ``issue_date``. Returns ``[]`` when there's nothing to compute."""
    if not text or not text.strip() or issue_date is None:
        return []
    t = text.strip().lower()

    if _IMMEDIATE_RE.search(t):
        return [{"days": 0, "due_date": issue_date.isoformat(), "end_of_month": False, "label": "immediato"}]

    fine_mese = bool(_FINE_MESE_RE.search(t))
    nums = [int(n) for n in _NUM_RE.findall(t)]

    # "ricevimento fattura" with no day count -> due on the invoice date.
    if _RECEIPT_RE.search(t) and not nums:
        return [{"days": 0, "due_date": issue_date.isoformat(), "end_of_month": False, "label": "ricevimento fattura"}]

    if not nums:
        # Unrecognised text with no numbers: due immediately, keep the label.
        return [{"days": 0, "due_date": issue_date.isoformat(), "end_of_month": False, "label": text.strip()}]

    out: list[dict] = []
    for n in nums:
        d = issue_date + timedelta(days=n)
        if fine_mese:
            d = _end_of_month(d)
        out.append({
            "days": n,
            "due_date": d.isoformat(),
            "end_of_month": fine_mese,
            "label": f"{n} gg" + (" fm" if fine_mese else ""),
        })
    return out
