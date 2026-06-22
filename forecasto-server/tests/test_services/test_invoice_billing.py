"""Unit tests for the invoice billing arithmetic (Decimal, to the cent)."""

from __future__ import annotations

from decimal import Decimal

from forecasto.services.invoice_service import compute_billing


def test_single_line_single_rate():
    r = compute_billing(
        [{"quantity": "1", "net_unit_price": "1000.00", "vat_rate": "22"}],
        [],
    )
    assert r["totals"]["line_total"] == "1000.00"
    assert r["totals"]["tax_total"] == "220.00"
    assert r["totals"]["grand_total"] == "1220.00"
    assert r["totals"]["due_payable"] == "1220.00"
    assert len(r["tax_breakdown"]) == 1
    assert r["tax_breakdown"][0]["taxable_amount"] == "1000.00"
    assert r["tax_breakdown"][0]["tax_amount"] == "220.00"


def test_multi_rate_grouping():
    r = compute_billing(
        [
            {"quantity": "2", "net_unit_price": "100.00", "vat_rate": "22"},
            {"quantity": "1", "net_unit_price": "50.00", "vat_rate": "10"},
            {"quantity": "1", "net_unit_price": "100.00", "vat_rate": "22"},
        ],
        [],
    )
    # 22%: 200 + 100 = 300 -> 66.00 ; 10%: 50 -> 5.00
    rates = {e["rate"]: e for e in r["tax_breakdown"]}
    assert rates["22"]["taxable_amount"] == "300.00"
    assert rates["22"]["tax_amount"] == "66.00"
    assert rates["10"]["taxable_amount"] == "50.00"
    assert rates["10"]["tax_amount"] == "5.00"
    assert r["totals"]["line_total"] == "350.00"
    assert r["totals"]["tax_total"] == "71.00"
    assert r["totals"]["grand_total"] == "421.00"


def test_scadenze_even_distribution_absorbs_remainder():
    r = compute_billing(
        [{"quantity": "1", "net_unit_price": "100.00", "vat_rate": "0"}],
        [{"due_date": "2026-07-01"}, {"due_date": "2026-08-01"}, {"due_date": "2026-09-01"}],
    )
    # grand_total 100.00 / 3 -> 33.33, 33.33, 33.34
    amounts = [s["amount"] for s in r["scadenze"]]
    assert amounts == ["33.33", "33.33", "33.34"]
    assert sum(Decimal(a) for a in amounts) == Decimal("100.00")


def test_explicit_scadenze_amounts_preserved():
    r = compute_billing(
        [{"quantity": "1", "net_unit_price": "1000.00", "vat_rate": "22"}],
        [
            {"due_date": "2026-07-01", "amount": "610.00"},
            {"due_date": "2026-08-01", "amount": "610.00"},
        ],
    )
    assert [s["amount"] for s in r["scadenze"]] == ["610.00", "610.00"]


def test_line_discount_percent():
    r = compute_billing(
        [{"quantity": "2", "net_unit_price": "100.00", "vat_rate": "22", "discount_percent": "10"}],
        [],
    )
    # 2×100 = 200, −10% = 180 ; IVA 22% = 39.60
    assert r["totals"]["line_total"] == "180.00"
    assert r["totals"]["tax_total"] == "39.60"
    assert r["totals"]["grand_total"] == "219.60"


def test_non_taxable_natura_in_breakdown():
    r = compute_billing(
        [{"quantity": "1", "net_unit_price": "500.00", "vat_rate": "0",
          "vat_category": "N", "natura": "N3.5"}],
        [],
    )
    assert r["totals"]["tax_total"] == "0.00"
    assert r["tax_breakdown"][0]["natura"] == "N3.5"
