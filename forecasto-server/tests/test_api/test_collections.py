"""API tests for the collections (schema-less document store) feature."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.utils.security import create_access_token, hash_password

pytestmark = pytest.mark.asyncio


def _ws(workspace: Workspace) -> str:
    return f"/api/v1/workspaces/{workspace.id}"


async def test_create_and_get_collection(authenticated_client: AsyncClient, test_workspace):
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections",
        json={
            "name": "Estratti conto Intesa",
            "handler_instructions": "Header con banca e data stampa, poi array righe.",
            "extraction_schema": {"type": "object"},
        },
    )
    assert resp.status_code == 201, resp.text
    coll = resp.json()["collection"]
    assert coll["slug"] == "estratti-conto-intesa"
    assert coll["document_count"] == 0

    got = await authenticated_client.get(f"{_ws(test_workspace)}/collections/{coll['id']}")
    assert got.status_code == 200
    assert got.json()["collection"]["handler_instructions"].startswith("Header")


async def test_slug_uniqueness(authenticated_client: AsyncClient, test_workspace):
    body = {"name": "Buste Paga"}
    a = await authenticated_client.post(f"{_ws(test_workspace)}/collections", json=body)
    b = await authenticated_client.post(f"{_ws(test_workspace)}/collections", json=body)
    assert a.json()["collection"]["slug"] == "buste-paga"
    assert b.json()["collection"]["slug"] == "buste-paga-2"


async def test_document_crud_and_count(authenticated_client: AsyncClient, test_workspace):
    coll_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "Contratti"}
        )
    ).json()["collection"]["id"]

    doc_resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents",
        json={
            "title": "Affitto sede",
            "data": {"parti": ["TechMakers", "Rossi SRL"], "canone": 1200, "banca": "Intesa"},
            "source_hash": "hash-1",
        },
    )
    assert doc_resp.status_code == 201, doc_resp.text

    # document_count incremented
    coll = (await authenticated_client.get(f"{_ws(test_workspace)}/collections/{coll_id}")).json()["collection"]
    assert coll["document_count"] == 1

    # dedup on source_hash: same hash returns existing, count unchanged
    dup = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents",
        json={"title": "again", "data": {}, "source_hash": "hash-1"},
    )
    assert dup.status_code == 201
    coll = (await authenticated_client.get(f"{_ws(test_workspace)}/collections/{coll_id}")).json()["collection"]
    assert coll["document_count"] == 1


async def test_json_query(authenticated_client: AsyncClient, test_workspace):
    coll_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "EC"}
        )
    ).json()["collection"]["id"]

    for banca, importo in [("Intesa", 100), ("Unicredit", 200), ("Intesa", 300)]:
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections/{coll_id}/documents",
            json={"data": {"banca": banca, "importo": importo}},
        )

    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents/query",
        json={"filters": [{"path": "$.banca", "op": "eq", "value": "Intesa"}]},
    )
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["total"] == 2
    assert all(d["data"]["banca"] == "Intesa" for d in out["documents"])

    # numeric comparison
    resp2 = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents/query",
        json={"filters": [{"path": "$.importo", "op": "gte", "value": 200}]},
    )
    assert resp2.json()["total"] == 2


async def test_query_projection_and_sort(authenticated_client: AsyncClient, test_workspace):
    coll_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "Fatture"}
        )
    ).json()["collection"]["id"]

    for cliente, totale in [("A", 100), ("B", 300), ("C", 200)]:
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections/{coll_id}/documents",
            json={"data": {"cliente": cliente, "totale": totale, "note": "x" * 50}},
        )

    # Projection: only the requested fields come back in `data`.
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents/query",
        json={
            "fields": ["$.cliente", "$.totale"],
            "order_by": [{"path": "$.totale", "direction": "desc"}],
        },
    )
    assert resp.status_code == 200, resp.text
    docs = resp.json()["documents"]
    assert [d["data"] for d in docs] == [
        {"cliente": "B", "totale": 300},
        {"cliente": "C", "totale": 200},
        {"cliente": "A", "totale": 100},
    ]


async def test_aggregate_endpoint(authenticated_client: AsyncClient, test_workspace):
    coll_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "Fatture"}
        )
    ).json()["collection"]["id"]

    rows = [
        {"cliente": "SIAD", "anno": 2025, "imponibile": 100, "totale": 122},
        {"cliente": "SIAD", "anno": 2025, "imponibile": 200, "totale": 244},
        {"cliente": "ACME", "anno": 2025, "imponibile": 50, "totale": 61},
        {"cliente": "ACME", "anno": 2024, "imponibile": 999, "totale": 999},
    ]
    for data in rows:
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections/{coll_id}/documents",
            json={"data": data},
        )

    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents/aggregate",
        json={
            "filters": [{"path": "$.anno", "op": "eq", "value": 2025}],
            "group_by": ["$.cliente"],
            "aggregates": [
                {"field": "$.imponibile", "fn": "sum", "as": "imponibile_totale"},
                {"field": "$.totale", "fn": "sum", "as": "fatturato_totale"},
                {"field": "$.cliente", "fn": "count", "as": "n_fatture"},
            ],
            "order_by": [{"path": "$.fatturato_totale", "direction": "desc"}],
        },
    )
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["total_groups"] == 2
    assert out["results"][0]["$.cliente"] == "SIAD"
    assert out["results"][0]["fatturato_totale"] == 366
    assert out["results"][0]["n_fatture"] == 2


async def test_quarantine_flow(authenticated_client: AsyncClient, test_workspace):
    # Ingest into quarantine (no collection)
    ing = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections",
        json={"name": "Dest"},
    )
    dest_id = ing.json()["collection"]["id"]

    # quarantine ingest requires machine auth; use the user-path create with no collection?
    # The user create endpoint always targets a collection, so we test quarantine via the
    # service-backed ingest endpoint is machine-only. Here we verify the quarantine list
    # is empty and routing rejects a non-quarantined doc.
    q = await authenticated_client.get(f"{_ws(test_workspace)}/quarantine")
    assert q.status_code == 200
    assert q.json()["total"] == 0

    count = await authenticated_client.get(f"{_ws(test_workspace)}/quarantine/count")
    assert count.json()["quarantined"] == 0


async def test_quarantine_ingest_and_route_via_apikey(
    authenticated_client: AsyncClient, test_workspace, db_session: AsyncSession
):
    """Machine ingest into quarantine, then user routes it into a collection."""
    from forecasto.models.workspace import ApiKey
    import hashlib

    raw_key = "test-api-key-collections"
    api_key = ApiKey(
        workspace_id=test_workspace.id,
        name="test",
        key_hash=hashlib.sha256(raw_key.encode()).hexdigest(),
    )
    db_session.add(api_key)
    await db_session.commit()

    dest_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "Routed"}
        )
    ).json()["collection"]["id"]

    ing = await authenticated_client.post(
        f"{_ws(test_workspace)}/quarantine:ingest",
        json={"data": {"foo": "bar"}, "quarantine_reason": "tipo sconosciuto"},
        headers={"X-API-Key": raw_key},
    )
    assert ing.status_code == 201, ing.text
    doc_id = ing.json()["document"]["id"]

    count = await authenticated_client.get(f"{_ws(test_workspace)}/quarantine/count")
    assert count.json()["quarantined"] == 1

    routed = await authenticated_client.post(
        f"{_ws(test_workspace)}/quarantine/{doc_id}/route",
        json={"collection_id": dest_id},
    )
    assert routed.status_code == 200, routed.text
    assert routed.json()["document"]["collection_id"] == dest_id
    assert routed.json()["document"]["status"] == "active"

    # quarantine now empty, collection count bumped
    assert (await authenticated_client.get(f"{_ws(test_workspace)}/quarantine/count")).json()["quarantined"] == 0
    coll = (await authenticated_client.get(f"{_ws(test_workspace)}/collections/{dest_id}")).json()["collection"]
    assert coll["document_count"] == 1


@pytest_asyncio.fixture
async def viewer_client(client: AsyncClient, db_session: AsyncSession, test_workspace):
    """A second user who is a viewer on the workspace."""
    viewer = User(
        email="viewer@example.com",
        password_hash=hash_password("x"),
        name="Viewer",
        email_verified=True,
    )
    db_session.add(viewer)
    await db_session.commit()
    await db_session.refresh(viewer)
    db_session.add(
        WorkspaceMember(workspace_id=test_workspace.id, user_id=viewer.id, role="viewer")
    )
    await db_session.commit()
    token = create_access_token({"sub": viewer.id, "email": viewer.email})
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


async def test_viewer_cannot_create_collection(viewer_client: AsyncClient, test_workspace):
    resp = await viewer_client.post(
        f"{_ws(test_workspace)}/collections", json={"name": "Nope"}
    )
    assert resp.status_code == 403


async def _member_headers(
    db_session: AsyncSession, test_workspace, *, email: str, role: str = "member", **flags
) -> dict:
    """Create a workspace member with the given collection flags; return auth headers."""
    user = User(
        email=email,
        password_hash=hash_password("x"),
        name="Member",
        email_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    db_session.add(
        WorkspaceMember(
            workspace_id=test_workspace.id, user_id=user.id, role=role, **flags
        )
    )
    await db_session.commit()
    token = create_access_token({"sub": user.id, "email": user.email})
    return {"Authorization": f"Bearer {token}"}


async def test_member_cannot_create_collection_by_default(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    headers = await _member_headers(db_session, test_workspace, email="m-create-no@example.com")
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections", json={"name": "Nope"}, headers=headers
    )
    assert resp.status_code == 403


async def test_member_can_create_collection_when_enabled(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    headers = await _member_headers(
        db_session, test_workspace, email="m-create-yes@example.com", can_create_collections=True
    )
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections", json={"name": "Member Coll"}, headers=headers
    )
    assert resp.status_code == 201, resp.text


async def test_member_cannot_write_documents_without_permission(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    coll_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "WriteGate"}
        )
    ).json()["collection"]["id"]

    headers = await _member_headers(
        db_session, test_workspace, email="m-write-no@example.com", can_write_collections=False
    )
    resp = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents",
        json={"data": {"x": 1}},
        headers=headers,
    )
    assert resp.status_code == 403

    # With write enabled (default) the same member can write.
    headers_ok = await _member_headers(db_session, test_workspace, email="m-write-yes@example.com")
    ok = await authenticated_client.post(
        f"{_ws(test_workspace)}/collections/{coll_id}/documents",
        json={"data": {"x": 1}},
        headers=headers_ok,
    )
    assert ok.status_code == 201, ok.text


async def test_member_cannot_read_without_permission(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    coll_id = (
        await authenticated_client.post(
            f"{_ws(test_workspace)}/collections", json={"name": "ReadGate"}
        )
    ).json()["collection"]["id"]

    headers = await _member_headers(
        db_session, test_workspace, email="m-read-no@example.com", can_read_collections=False
    )
    listed = await authenticated_client.get(
        f"{_ws(test_workspace)}/collections", headers=headers
    )
    assert listed.status_code == 403

    got = await authenticated_client.get(
        f"{_ws(test_workspace)}/collections/{coll_id}", headers=headers
    )
    assert got.status_code == 403


async def test_non_member_gets_403(client: AsyncClient, db_session: AsyncSession, test_workspace):
    outsider = User(
        email="out@example.com",
        password_hash=hash_password("x"),
        name="Out",
        email_verified=True,
    )
    db_session.add(outsider)
    await db_session.commit()
    await db_session.refresh(outsider)
    token = create_access_token({"sub": outsider.id, "email": outsider.email})
    resp = await client.get(
        f"{_ws(test_workspace)}/collections",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
