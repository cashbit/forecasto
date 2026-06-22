"""Tests for the deterministic payment-terms parser."""

from __future__ import annotations

from datetime import date

from forecasto.services.payment_terms import parse_payment_terms

D = date(2026, 1, 15)  # invoice date used across tests


def _dates(text):
    return [p["due_date"] for p in parse_payment_terms(text, D)]


def test_immediate_variants():
    for t in ("immediato", "Rimessa Diretta", "contanti", "pronto cassa"):
        assert _dates(t) == ["2026-01-15"]


def test_receipt_of_invoice():
    assert _dates("ricevimento fattura") == ["2026-01-15"]
    assert _dates("RF") == ["2026-01-15"]


def test_single_net_days():
    assert _dates("30 gg") == ["2026-02-14"]
    assert _dates("60 giorni") == ["2026-03-16"]


def test_multi_installments():
    # 30/60/90 days from 2026-01-15
    assert _dates("30/60/90 df") == ["2026-02-14", "2026-03-16", "2026-04-15"]


def test_fine_mese_snaps_to_end_of_month():
    # +30 gg -> 2026-02-14, then end of February
    assert _dates("30 gg fm") == ["2026-02-28"]
    # 30/60/90 each + days then end of month
    assert _dates("30/60/90 df fm") == ["2026-02-28", "2026-03-31", "2026-04-30"]


def test_empty_or_no_date():
    assert parse_payment_terms("", D) == []
    assert parse_payment_terms("30 gg", None) == []


def test_labels_present():
    parsed = parse_payment_terms("30/60/90 df fm", D)
    assert [p["label"] for p in parsed] == ["30 gg fm", "60 gg fm", "90 gg fm"]
