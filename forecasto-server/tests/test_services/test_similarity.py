"""Unit tests for the similarity scoring module.

Pure-function tests — no DB / async fixtures required.
"""

from __future__ import annotations

from forecasto.services.similarity import (
    _amount_similarity,
    _normalize_vat,
    _reference_similarity,
    compute_similarity_score,
)


# ---------------------------------------------------------------------------
# Amount similarity — payment-doc curve is strict, commercial curve is loose
# ---------------------------------------------------------------------------


def test_amount_exact_match_both_curves():
    assert _amount_similarity(1000.0, 1000.0, is_payment_doc=False) == 1.0
    assert _amount_similarity(1000.0, 1000.0, is_payment_doc=True) == 1.0


def test_amount_payment_doc_rejects_5pct_diff():
    # 1000 vs 1100 = 10% diff → must be 0.0 for payment docs
    assert _amount_similarity(1000.0, 1100.0, is_payment_doc=True) == 0.0


def test_amount_payment_doc_accepts_small_euro_slack():
    # €1.50 slack on a €5k bonifico — fee / rounding territory, must stay 1.0
    assert _amount_similarity(5000.00, 4998.50, is_payment_doc=True) == 1.0


def test_amount_payment_doc_tight_2pct():
    # 2% gap → partial credit but still high (~0.85)
    s = _amount_similarity(1000.0, 1020.0, is_payment_doc=True)
    assert 0.8 <= s <= 0.9


def test_amount_commercial_tolerates_10pct():
    # Commercial docs (offers/invoices) legitimately drift between versions
    # → 10% should still score 0.5
    assert _amount_similarity(10000.0, 11000.0, is_payment_doc=False) == 0.5


def test_amount_commercial_rejects_huge_diff():
    assert _amount_similarity(1000.0, 2000.0, is_payment_doc=False) == 0.0


def test_payment_curve_is_stricter_than_commercial():
    # The whole point of the rewrite: at 8% diff a wire transfer should
    # score LOWER than the same gap on an invoice update.
    pay = _amount_similarity(1000.0, 1080.0, is_payment_doc=True)
    comm = _amount_similarity(1000.0, 1080.0, is_payment_doc=False)
    assert pay < comm


# ---------------------------------------------------------------------------
# Reference similarity — rapidfuzz must handle abbreviations, typos, suffixes
# ---------------------------------------------------------------------------


def test_reference_exact_match():
    assert _reference_similarity("Italtronic S.r.l.", "Italtronic SRL") >= 0.95


def test_reference_initial_abbreviation():
    # The old Jaccard would drop "M." as a 1-char token and lose "Mario"
    s = _reference_similarity("M. Rossi", "Mario Rossi")
    assert s >= 0.7


def test_reference_typo_tolerance():
    # OCR-style typo
    s = _reference_similarity("Italtroinc SRL", "Italtronic SRL")
    assert s >= 0.7


def test_reference_token_order_insensitive():
    s = _reference_similarity("Rossi Mario", "Mario Rossi")
    assert s >= 0.9


def test_reference_unrelated_companies():
    s = _reference_similarity("ENEL Energia SpA", "Amazon Web Services")
    assert s < 0.4


def test_reference_empty_inputs():
    assert _reference_similarity("", "Italtronic") == 0.0
    assert _reference_similarity("ACME SRL", "") == 0.0


# ---------------------------------------------------------------------------
# P.IVA exact match — overrides weak name similarity
# ---------------------------------------------------------------------------


def test_vat_match_overrides_weak_name():
    """Two records with totally different display names but the same P.IVA
    must score as the same counterpart."""
    candidate = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "total": 1220.0,
        "transaction_id": "",
        "note": "",
        "stage": "0",
        "area": "orders",
        "classification": {"counterpart_vat": "IT01234567890"},
    }
    query = {
        "reference": "Acme Srl Unipersonale",
        "account": "Hardware",
        "amount": 1000.0,
        "transaction_id": "",
        "note": "",
        "classification": {"counterpart_vat": "IT01234567890"},
    }
    score, reasons, _ = compute_similarity_score(candidate, query, document_type="invoice")
    assert score >= 0.7
    assert any("P.IVA" in r for r in reasons)


def test_vat_normalization_strips_whitespace_and_case():
    assert _normalize_vat("it 01234567890") == "IT01234567890"
    assert _normalize_vat(" IT-01234567890 ") == "IT01234567890"
    assert _normalize_vat(None) == ""


def test_vat_mismatch_does_not_boost():
    """Different P.IVA → no override, falls through to name scoring."""
    candidate = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "transaction_id": "",
        "stage": "0",
        "area": "orders",
        "classification": {"counterpart_vat": "IT01234567890"},
    }
    query = {
        "reference": "Beta SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "classification": {"counterpart_vat": "IT99999999999"},
    }
    score, reasons, _ = compute_similarity_score(candidate, query, document_type="invoice")
    assert not any("P.IVA" in r for r in reasons)
    assert score < 0.6


def test_vat_absent_on_one_side_does_not_override():
    """Only one side has a VAT → name-based scoring runs as usual."""
    candidate = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "stage": "0",
        "area": "orders",
        "classification": {},
    }
    query = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "classification": {"counterpart_vat": "IT01234567890"},
    }
    score, reasons, _ = compute_similarity_score(candidate, query, document_type="invoice")
    # Name still matches, but the booster reason must be absent
    assert not any("P.IVA" in r for r in reasons)
    assert score >= 0.7


# ---------------------------------------------------------------------------
# End-to-end match_type classification
# ---------------------------------------------------------------------------


def test_bonifico_with_exact_amount_yields_payment():
    candidate = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "total": 1220.0,
        "transaction_id": "Fattura 5/2026",
        "note": "",
        "stage": "0",
        "area": "orders",
    }
    query = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "transaction_id": "",
        "note": "",
    }
    _, _, match_type = compute_similarity_score(candidate, query, document_type="wire_transfer")
    assert match_type == "payment"


def test_bonifico_with_wrong_amount_does_not_promote_to_payment():
    """The whole motivation: at 10% gap the bonifico must NOT silently
    confirm payment of an unrelated invoice."""
    candidate = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1000.0,
        "total": 1220.0,
        "transaction_id": "Fattura 5/2026",
        "note": "",
        "stage": "0",
        "area": "orders",
    }
    query = {
        "reference": "ACME SRL",
        "account": "Hardware",
        "amount": 1100.0,
        "transaction_id": "",
        "note": "",
    }
    _, _, match_type = compute_similarity_score(candidate, query, document_type="wire_transfer")
    assert match_type != "payment"
