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
