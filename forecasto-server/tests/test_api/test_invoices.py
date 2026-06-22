"""API tests for invoice draft create/update/get/list (Phase 2)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from forecasto.models.workspace import Workspace

pytestmark = pytest.mark.asyncio


def _ws(workspace: Workspace) -> str:
    return f"/api/v1/workspaces/{workspace.id}"


async def test_create_draft_computes_totals(authenticated_client: AsyncClient, test_workspace):
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={
            "type_code": "380",
            "lines": [
                {"name": "Consulenza", "quantity": "1", "net_unit_price": "1000.00", "vat_rate": "22"}
            ],
            "payments": {"scadenze": [{"due_date": "2026-07-19"}]},
        },
    )
    assert resp.status_code == 201, resp.text
    inv = resp.json()["invoice"]
    assert inv["status"] == "draft"
    assert inv["number"] is None
    assert inv["data"]["totals"]["grand_total"] == "1220.00"
    assert inv["data"]["payments"]["scadenze"][0]["amount"] == "1220.00"
    assert inv["data"]["sync"]["data_fingerprint"]


async def test_update_draft_recomputes(authenticated_client: AsyncClient, test_workspace):
    created = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/invoices/draft",
            json={"lines": [{"net_unit_price": "100.00", "vat_rate": "22"}]},
        )
    ).json()["invoice"]
    fp1 = created["data"]["sync"]["data_fingerprint"]

    updated = await authenticated_client.patch(
        f"{_ws(test_workspace)}/invoices/{created['document_id']}",
        json={"lines": [{"net_unit_price": "200.00", "vat_rate": "22"}]},
    )
    assert updated.status_code == 200, updated.text
    data = updated.json()["invoice"]["data"]
    assert data["totals"]["grand_total"] == "244.00"
    assert data["sync"]["data_fingerprint"] != fp1


async def test_draft_generates_scadenze_from_terms(authenticated_client: AsyncClient, test_workspace):
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={
            "issue_date": "2026-01-15",
            "lines": [{"net_unit_price": "900.00", "vat_rate": "0", "vat_category": "N", "natura": "N2.2"}],
            "payments": {"terms": "30/60/90 df fm"},
        },
    )
    assert resp.status_code == 201, resp.text
    scad = resp.json()["invoice"]["data"]["payments"]["scadenze"]
    assert [s["due_date"] for s in scad] == ["2026-02-28", "2026-03-31", "2026-04-30"]
    # 900 split across 3 → 300 each
    assert [s["amount"] for s in scad] == ["300.00", "300.00", "300.00"]


async def test_parse_payment_terms_endpoint(authenticated_client: AsyncClient, test_workspace):
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/parse-payment-terms",
        json={"text": "30 gg fm", "issue_date": "2026-01-15"},
    )
    assert resp.status_code == 200, resp.text
    assert [s["due_date"] for s in resp.json()["scadenze"]] == ["2026-02-28"]


async def test_list_invoices(authenticated_client: AsyncClient, test_workspace):
    await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={"lines": [{"net_unit_price": "10.00", "vat_rate": "22"}]},
    )
    listed = await authenticated_client.get(f"{_ws(test_workspace)}/invoices")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1


async def _customer(client, ws, vat="IT09876543210", name="ACME SpA"):
    return (await client.post(f"{_ws(ws)}/customers", json={"legal_name": name, "vat_id": vat})).json()["customer"]


async def test_issue_assigns_number_and_creates_records(authenticated_client: AsyncClient, test_workspace):
    cust = await _customer(authenticated_client, test_workspace)
    draft = (await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={
            "customer_document_id": cust["document_id"],
            "issue_date": "2026-01-15",
            "lines": [{"net_unit_price": "3000.00", "vat_rate": "22"}],
            "payments": {"terms": "30/60/90 df fm"},
        },
    )).json()["invoice"]

    issued = await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/{draft['document_id']}/issue"
    )
    assert issued.status_code == 200, issued.text
    inv = issued.json()["invoice"]
    assert inv["status"] == "issued"
    assert inv["number"] == "2026/0001"
    d = inv["data"]
    # one actual record per scadenza, cross-referenced
    assert len(d["links"]["actual_record_ids"]) == 3
    assert all(s.get("record_id") for s in d["payments"]["scadenze"])

    # records exist in the actual area, summing to the invoice total
    recs = (await authenticated_client.get(f"{_ws(test_workspace)}/records", params={"area": "actual"})).json()["records"]
    mine = [r for r in recs if r["transaction_id"] == "Fattura 2026/0001"]
    assert len(mine) == 3
    assert sum(float(r["total"]) for r in mine) == 3660.00


async def test_issue_generates_einvoice_xml(authenticated_client: AsyncClient, test_workspace):
    cust = await _customer(authenticated_client, test_workspace, vat="IT44444444444", name="Gamma")
    draft = (await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={"customer_document_id": cust["document_id"], "issue_date": "2026-01-20",
              "lines": [{"net_unit_price": "1000.00", "vat_rate": "22"}]},
    )).json()["invoice"]
    issued = (await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/issue")).json()["invoice"]
    assert len(issued["data"]["links"]["einvoice_doc_ids"]) == 1

    listed = await authenticated_client.get(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/einvoices")
    einv = listed.json()["einvoices"]
    assert [e["standard"] for e in einv] == ["fatturapa"]
    assert einv[0]["validation"]["ok"] is True

    xml = await authenticated_client.get(f"{_ws(test_workspace)}/einvoices/{einv[0]['document_id']}/xml")
    assert xml.status_code == 200
    assert "FatturaElettronica" in xml.text
    assert issued["number"] in xml.text


async def test_edit_after_issue_resyncs_xml(authenticated_client: AsyncClient, test_workspace):
    cust = await _customer(authenticated_client, test_workspace, vat="IT66666666666", name="Eps")
    draft = (await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={"customer_document_id": cust["document_id"], "issue_date": "2026-01-20",
              "lines": [{"net_unit_price": "1000.00", "vat_rate": "22"}]},
    )).json()["invoice"]
    doc_id = draft["document_id"]
    await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{doc_id}/issue")

    einv_id = (await authenticated_client.get(f"{_ws(test_workspace)}/invoices/{doc_id}/einvoices")).json()["einvoices"][0]["document_id"]
    xml1 = (await authenticated_client.get(f"{_ws(test_workspace)}/einvoices/{einv_id}/xml")).text
    assert "1220.00" in xml1

    # Edit the issued invoice → XML must re-sync to the new total.
    await authenticated_client.patch(
        f"{_ws(test_workspace)}/invoices/{doc_id}",
        json={"lines": [{"net_unit_price": "2000.00", "vat_rate": "22"}]},
    )
    xml2 = (await authenticated_client.get(f"{_ws(test_workspace)}/einvoices/{einv_id}/xml")).text
    assert "2440.00" in xml2
    assert "1220.00" not in xml2


async def test_foreign_recipient_gets_two_standards(authenticated_client: AsyncClient, test_workspace):
    cust = (await authenticated_client.post(
        f"{_ws(test_workspace)}/customers",
        json={"legal_name": "Berlin GmbH", "vat_id": "DE142772377", "country_code": "DE"},
    )).json()["customer"]
    draft = (await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={"customer_document_id": cust["document_id"], "issue_date": "2026-01-22",
              "lines": [{"net_unit_price": "500.00", "vat_rate": "22"}]},
    )).json()["invoice"]
    await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/issue")
    einv = (await authenticated_client.get(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/einvoices")).json()["einvoices"]
    assert sorted(e["standard"] for e in einv) == ["fatturapa", "xrechnung"]


async def _issued_invoice(client, ws, vat, name="Cust"):
    cust = await _customer(client, ws, vat=vat, name=name)
    draft = (await client.post(
        f"{_ws(ws)}/invoices/draft",
        json={"customer_document_id": cust["document_id"], "issue_date": "2026-01-20",
              "lines": [{"net_unit_price": "100.00", "vat_rate": "22"}]},
    )).json()["invoice"]
    await client.post(f"{_ws(ws)}/invoices/{draft['document_id']}/issue")
    return draft["document_id"]


async def test_lifecycle_sent_then_sdi(authenticated_client: AsyncClient, test_workspace):
    doc = await _issued_invoice(authenticated_client, test_workspace, "IT77777777777")

    sent = await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{doc}/sent-to-client")
    assert sent.status_code == 200, sent.text
    lc = sent.json()["invoice"]["data"]["lifecycle"]
    assert lc["status"] == "sent_to_client" and lc["sent_to_client_at"]

    sdi = await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/{doc}/sdi-submission", json={"outcome": "accepted"}
    )
    assert sdi.status_code == 200, sdi.text
    lc2 = sdi.json()["invoice"]["data"]["lifecycle"]
    assert lc2["sdi_submitted_at"] and lc2["status"] == "accepted" and lc2["sdi_outcome"] == "accepted"


async def test_edit_blocked_after_sdi(authenticated_client: AsyncClient, test_workspace):
    doc = await _issued_invoice(authenticated_client, test_workspace, "IT88888888888")
    await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{doc}/sdi-submission", json={})
    blocked = await authenticated_client.patch(
        f"{_ws(test_workspace)}/invoices/{doc}",
        json={"lines": [{"net_unit_price": "999.00", "vat_rate": "22"}]},
    )
    assert blocked.status_code == 409, blocked.text


async def test_issue_requires_customer_fiscal_id(authenticated_client: AsyncClient, test_workspace):
    draft = (await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={"lines": [{"net_unit_price": "100.00", "vat_rate": "22"}]},
    )).json()["invoice"]
    resp = await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/issue")
    assert resp.status_code == 400, resp.text


async def test_cannot_issue_twice(authenticated_client: AsyncClient, test_workspace):
    cust = await _customer(authenticated_client, test_workspace, vat="IT33333333333", name="Beta")
    draft = (await authenticated_client.post(
        f"{_ws(test_workspace)}/invoices/draft",
        json={"customer_document_id": cust["document_id"], "issue_date": "2026-02-01",
              "lines": [{"net_unit_price": "100.00", "vat_rate": "22"}]},
    )).json()["invoice"]
    first = await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/issue")
    assert first.status_code == 200
    second = await authenticated_client.post(f"{_ws(test_workspace)}/invoices/{draft['document_id']}/issue")
    assert second.status_code == 409, second.text


async def test_draft_with_customer_snapshot(authenticated_client: AsyncClient, test_workspace):
    cust = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/customers",
            json={"legal_name": "ACME SpA", "vat_id": "IT09876543210"},
        )
    ).json()["customer"]
    inv = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/invoices/draft",
            json={
                "customer_document_id": cust["document_id"],
                "lines": [{"net_unit_price": "100.00", "vat_rate": "22"}],
            },
        )
    ).json()["invoice"]
    assert inv["data"]["customer_ref"]["vat_id"] == "IT09876543210"
    assert inv["data"]["customer_snapshot"]["legal_name"] == "ACME SpA"
