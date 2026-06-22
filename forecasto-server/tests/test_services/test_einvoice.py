"""Unit tests for the e-invoice mapping layer (invoice doc -> CanonicalInvoice)."""

from __future__ import annotations

from einvoice.serialize.fatturapa import serialize_fatturapa
from einvoice.validate import validate

from forecasto.services.einvoice_service import build_canonical, targets_for


def _invoice_data():
    return {
        "number": "2026/0001",
        "issue_date": "2026-01-15",
        "type_code": "380",
        "currency": "EUR",
        "emitter": {"legal_name": "TechMakers SRL", "vat_id": "IT01234567890",
                    "regime_fiscale": "RF01", "address": {"line_one": "Via Roma 1", "city": "Genova", "postcode": "16100", "country_code": "IT"},
                    "bank": {"iban": "IT60X0542811101000000123456"}},
        "customer_snapshot": {"legal_name": "ACME SpA", "vat_id": "IT09876543210", "country_code": "IT",
                              "address": {"line_one": "Via Milano 2", "city": "Milano", "postcode": "20100", "country_code": "IT"},
                              "sdi": {"codice_destinatario": "ABCDEFG"}},
        "lines": [{"id": "1", "name": "Consulenza", "quantity": "1", "net_unit_price": "1000.00",
                   "line_net_amount": "1000.00", "vat_rate": "22", "vat_category": "S"}],
        "tax_breakdown": [{"category": "S", "rate": "22", "taxable_amount": "1000.00", "tax_amount": "220.00"}],
        "totals": {"line_total": "1000.00", "allowance_total": "0.00", "charge_total": "0.00",
                   "tax_basis_total": "1000.00", "tax_total": "220.00", "grand_total": "1220.00",
                   "prepaid_amount": "0.00", "rounding_amount": "0.00", "due_payable": "1220.00"},
        "payments": {"means_code": "30", "esigibilita_iva": "I",
                     "scadenze": [{"id": "sc1", "due_date": "2026-02-14", "amount": "1220.00"}]},
        "fattura_pa_ext": {},
    }


def test_build_canonical_validates_clean():
    inv = build_canonical(_invoice_data())
    res = validate(inv)
    assert res.ok, res.errors


def test_fatturapa_serialization_carries_key_fields():
    inv = build_canonical(_invoice_data())
    xml = serialize_fatturapa(inv).decode("utf-8")
    assert "FatturaElettronica" in xml
    assert "<Numero>2026/0001</Numero>" in xml
    assert "ABCDEFG" in xml  # codice destinatario
    assert "1220.00" in xml  # document total
    assert "IT60X0542811101000000123456" in xml  # emitter IBAN in DatiPagamento


def test_discounted_line_reconciles_unit_price():
    data = _invoice_data()
    data["lines"] = [{"id": "1", "name": "Servizio", "quantity": "2", "net_unit_price": "100.00",
                      "discount_percent": "10", "line_net_amount": "180.00", "vat_rate": "22", "vat_category": "S"}]
    data["tax_breakdown"] = [{"category": "S", "rate": "22", "taxable_amount": "180.00", "tax_amount": "39.60"}]
    data["totals"] = {**data["totals"], "line_total": "180.00", "tax_basis_total": "180.00",
                      "tax_total": "39.60", "grand_total": "219.60", "due_payable": "219.60"}
    inv = build_canonical(data)
    assert validate(inv).ok
    # effective unit price = 180 / 2 = 90.00 so qty×unit == line total
    assert inv.lines[0].net_unit_price == __import__("decimal").Decimal("90.00")


def test_targets_for():
    assert targets_for("IT", "IT") == ["fatturapa"]
    assert targets_for("IT", "DE") == ["fatturapa", "xrechnung"]
    assert targets_for("IT", "FR") == ["fatturapa", "peppol"]
    assert targets_for("IT", None) == ["fatturapa"]
