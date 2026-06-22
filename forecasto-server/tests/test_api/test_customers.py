"""API tests for the customers (anagrafiche cliente) feature."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from forecasto.models.workspace import Workspace

pytestmark = pytest.mark.asyncio


def _ws(workspace: Workspace) -> str:
    return f"/api/v1/workspaces/{workspace.id}"


async def test_upsert_is_idempotent_on_vat(authenticated_client: AsyncClient, test_workspace):
    body = {
        "legal_name": "ACME SpA",
        "vat_id": "IT09876543210",
        "address": {"line_one": "Via Milano 2", "city": "Milano", "postcode": "20100"},
    }
    a = await authenticated_client.post(f"{_ws(test_workspace)}/customers", json=body)
    assert a.status_code == 201, a.text
    first = a.json()["customer"]
    assert first["data"]["vat_id"] == "IT09876543210"

    # Re-submitting with the same VAT (different spacing) updates the same doc.
    b = await authenticated_client.post(
        f"{_ws(test_workspace)}/customers",
        json={**body, "vat_id": "IT 09876543210", "legal_name": "ACME S.p.A."},
    )
    assert b.status_code == 201, b.text
    second = b.json()["customer"]
    assert second["document_id"] == first["document_id"]
    assert second["data"]["legal_name"] == "ACME S.p.A."

    listed = await authenticated_client.get(f"{_ws(test_workspace)}/customers")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


async def test_custnumber_assigned_and_searchable(authenticated_client: AsyncClient, test_workspace):
    a = (await authenticated_client.post(
        f"{_ws(test_workspace)}/customers", json={"legal_name": "Alpha SpA", "vat_id": "IT11111111111"}
    )).json()["customer"]
    b = (await authenticated_client.post(
        f"{_ws(test_workspace)}/customers", json={"legal_name": "Beta SpA", "vat_id": "IT22222222222"}
    )).json()["customer"]
    assert a["data"]["customer_code"] == "C00001"
    assert b["data"]["customer_code"] == "C00002"

    # Search by customer code, by VAT and by name (OR across fields).
    by_code = await authenticated_client.get(f"{_ws(test_workspace)}/customers", params={"search": "C00002"})
    assert [c["data"]["legal_name"] for c in by_code.json()["customers"]] == ["Beta SpA"]
    by_vat = await authenticated_client.get(f"{_ws(test_workspace)}/customers", params={"search": "11111111111"})
    assert [c["data"]["legal_name"] for c in by_vat.json()["customers"]] == ["Alpha SpA"]
    by_name = await authenticated_client.get(f"{_ws(test_workspace)}/customers", params={"search": "beta"})
    assert [c["data"]["legal_name"] for c in by_name.json()["customers"]] == ["Beta SpA"]


async def test_upsert_requires_vat_or_tax_number(authenticated_client: AsyncClient, test_workspace):
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/customers", json={"legal_name": "Senza Dati"}
    )
    assert resp.status_code == 400, resp.text


async def test_get_customer_roundtrip(authenticated_client: AsyncClient, test_workspace):
    created = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/customers",
            json={"legal_name": "Privato", "tax_number": "RSSMRA80A01H501U", "country_code": "IT"},
        )
    ).json()["customer"]
    got = await authenticated_client.get(
        f"{_ws(test_workspace)}/customers/{created['document_id']}"
    )
    assert got.status_code == 200
    assert got.json()["customer"]["data"]["tax_number"] == "RSSMRA80A01H501U"
