"""API + service tests for the numerators (document numbering) feature."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ConflictException
from forecasto.models.numerator import Numerator
from forecasto.models.user import User
from forecasto.models.workspace import WorkspaceMember
from forecasto.schemas.numerator import NumeratorCreate
from forecasto.services.numerator_service import (
    NumeratorService,
    compute_period_key,
    render_number,
)
from forecasto.utils.security import create_access_token, hash_password

pytestmark = pytest.mark.asyncio


def _ws(workspace) -> str:
    return f"/api/v1/workspaces/{workspace.id}"


async def _create(client: AsyncClient, workspace, **overrides) -> dict:
    body = {"key": "offerte", "name": "Offerte"}
    body.update(overrides)
    resp = await client.post(f"{_ws(workspace)}/numerators", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["numerator"]


# ---------------------------------------------------------------------------
# HTTP: CRUD + two-phase issuance
# ---------------------------------------------------------------------------

async def test_create_and_get(authenticated_client: AsyncClient, test_workspace):
    num = await _create(
        authenticated_client,
        test_workspace,
        reset_policy="yearly",
        start_number=1,
        include_year=True,
        separator="/",
        padding=3,
    )
    assert num["key"] == "offerte"
    assert num["last_value"] is None

    got = await authenticated_client.get(f"{_ws(test_workspace)}/numerators/{num['id']}")
    assert got.status_code == 200
    assert got.json()["numerator"]["reset_policy"] == "yearly"


async def test_duplicate_key_conflicts(authenticated_client: AsyncClient, test_workspace):
    await _create(authenticated_client, test_workspace, key="fatture", name="Fatture")
    dup = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators", json={"key": "fatture", "name": "Altre"}
    )
    assert dup.status_code == 409


async def test_reserve_confirm_advances_and_logs(authenticated_client: AsyncClient, test_workspace):
    num = await _create(
        authenticated_client, test_workspace, reset_policy="yearly", include_year=True, padding=3
    )
    year = datetime.utcnow().year

    r = await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert res["status"] == "reserved"
    assert res["value"] == 1
    assert res["formatted"] == f"{year}/001"
    token = res["token"]

    c = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators/{num['id']}/confirm", json={"token": token}
    )
    assert c.status_code == 200, c.text
    assert c.json()["result"]["formatted"] == f"{year}/001"

    # Entry recorded
    entries = (
        await authenticated_client.get(f"{_ws(test_workspace)}/numerators/{num['id']}/entries")
    ).json()
    assert entries["total"] == 1
    assert entries["entries"][0]["value"] == 1

    # Next reserve offers 2
    r2 = await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")
    assert r2.json()["result"]["value"] == 2


async def test_reserve_idempotent_same_user(authenticated_client: AsyncClient, test_workspace):
    num = await _create(authenticated_client, test_workspace)
    a = (await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")).json()["result"]
    b = (await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")).json()["result"]
    # Same caller gets the same reservation back, not a "pending" wait.
    assert b["status"] == "reserved"
    assert a["token"] == b["token"]
    assert a["value"] == b["value"]


async def test_double_confirm_conflicts(authenticated_client: AsyncClient, test_workspace):
    num = await _create(authenticated_client, test_workspace)
    token = (
        await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")
    ).json()["result"]["token"]
    first = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators/{num['id']}/confirm", json={"token": token}
    )
    assert first.status_code == 200
    second = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators/{num['id']}/confirm", json={"token": token}
    )
    assert second.status_code == 409


async def test_immediate_issue_ttl_zero(authenticated_client: AsyncClient, test_workspace):
    num = await _create(
        authenticated_client, test_workspace, key="protocollo", name="Protocollo",
        confirm_ttl_seconds=0, start_number=100, padding=4,
    )
    r = await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert res["status"] == "issued"
    assert res["token"] is None
    assert res["value"] == 100
    assert res["formatted"] == "0100"

    # Advanced immediately + a second call is consecutive and distinct.
    r2 = (await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")).json()["result"]
    assert r2["status"] == "issued"
    assert r2["value"] == 101

    entries = (
        await authenticated_client.get(f"{_ws(test_workspace)}/numerators/{num['id']}/entries")
    ).json()
    assert entries["total"] == 2
    assert sorted(e["value"] for e in entries["entries"]) == [100, 101]


# ---------------------------------------------------------------------------
# Service-level: expiry, boundary, reset (time-sensitive, no sleeping)
# ---------------------------------------------------------------------------

async def _svc_numerator(db: AsyncSession, workspace, user, **kw) -> Numerator:
    svc = NumeratorService(db)
    data = NumeratorCreate(key=kw.pop("key", "svc"), name=kw.pop("name", "Svc"), **kw)
    num = await svc.create_numerator(workspace.id, data, user_id=user.id)
    await db.commit()
    return num


async def test_expiry_releases_candidate_no_gap(
    db_session: AsyncSession, test_workspace, test_user
):
    svc = NumeratorService(db_session)
    num = await _svc_numerator(db_session, test_workspace, test_user, confirm_ttl_seconds=60)

    first = await svc.reserve(test_workspace.id, num.id, reserved_by=test_user.id)
    assert first.status == "reserved" and first.value == 1
    old_token = first.token

    # Force the reservation to be expired (simulate the minute lapsing).
    await db_session.refresh(num)
    num.pending_expires_at = datetime.utcnow() - timedelta(seconds=1)
    await db_session.flush()

    # Confirming the expired token fails...
    with pytest.raises(ConflictException):
        await svc.confirm(test_workspace.id, num.id, old_token, issued_by=test_user.id)

    # ...and re-reserving offers the SAME candidate (no gap).
    again = await svc.reserve(test_workspace.id, num.id, reserved_by=test_user.id)
    assert again.status == "reserved"
    assert again.value == 1
    assert again.token != old_token


async def test_period_boundary_crossed_rejects(
    db_session: AsyncSession, test_workspace, test_user
):
    svc = NumeratorService(db_session)
    num = await _svc_numerator(
        db_session, test_workspace, test_user, key="bnd", reset_policy="yearly", confirm_ttl_seconds=60
    )
    res = await svc.reserve(test_workspace.id, num.id, reserved_by=test_user.id)
    assert res.status == "reserved"

    # Simulate the wall clock having moved into a different year since reserve.
    await db_session.refresh(num)
    num.pending_period_key = "1999"
    await db_session.flush()

    with pytest.raises(ConflictException):
        await svc.confirm(test_workspace.id, num.id, res.token, issued_by=test_user.id)


async def test_yearly_reset_to_start(db_session: AsyncSession, test_workspace, test_user):
    svc = NumeratorService(db_session)
    num = await _svc_numerator(
        db_session, test_workspace, test_user, key="yr", reset_policy="yearly", start_number=1
    )
    # Simulate a prior period with a high counter.
    await db_session.refresh(num)
    num.last_value = 42
    num.period_key = "1999"
    await db_session.flush()

    peek = await svc.peek(test_workspace.id, num.id)
    # Current period differs from the stored "1999" => resets to start_number.
    assert peek.value == 1
    assert peek.period_key == compute_period_key("yearly", datetime.utcnow())


async def test_pending_blocks_other_user(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    num = await _create(authenticated_client, test_workspace)
    # Owner reserves.
    await authenticated_client.post(f"{_ws(test_workspace)}/numerators/{num['id']}/reserve")
    # A different member tries to reserve -> told to wait.
    headers = await _member_headers(db_session, test_workspace, email="second@example.com")
    r = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators/{num['id']}/reserve", headers=headers
    )
    res = r.json()["result"]
    assert res["status"] == "pending"
    assert res["retry_after_seconds"] >= 1


def test_render_number_formats():
    class N:
        prefix = "INV"
        suffix = None
        separator = "-"
        padding = 4
        include_year = True
        include_month = False
    dt = datetime(2026, 6, 10)
    assert render_number(N(), 7, dt) == "INV-2026-0007"

    class M:
        prefix = None
        suffix = None
        separator = "/"
        padding = 3
        include_year = True
        include_month = False
    assert render_number(M(), 1, dt) == "2026/001"


# ---------------------------------------------------------------------------
# Permission gating
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def viewer_client(client: AsyncClient, db_session: AsyncSession, test_workspace):
    viewer = User(email="nview@example.com", password_hash=hash_password("x"), name="V", email_verified=True)
    db_session.add(viewer)
    await db_session.commit()
    await db_session.refresh(viewer)
    db_session.add(WorkspaceMember(workspace_id=test_workspace.id, user_id=viewer.id, role="viewer"))
    await db_session.commit()
    token = create_access_token({"sub": viewer.id, "email": viewer.email})
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


async def _member_headers(
    db_session: AsyncSession, test_workspace, *, email: str, role: str = "member", **flags
) -> dict:
    user = User(email=email, password_hash=hash_password("x"), name="M", email_verified=True)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    db_session.add(WorkspaceMember(workspace_id=test_workspace.id, user_id=user.id, role=role, **flags))
    await db_session.commit()
    token = create_access_token({"sub": user.id, "email": user.email})
    return {"Authorization": f"Bearer {token}"}


async def test_viewer_cannot_create_or_reserve(viewer_client: AsyncClient, test_workspace):
    c = await viewer_client.post(f"{_ws(test_workspace)}/numerators", json={"key": "x", "name": "X"})
    assert c.status_code == 403


async def test_member_create_gated(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    no = await _member_headers(db_session, test_workspace, email="nc@example.com")
    r = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators", json={"key": "a", "name": "A"}, headers=no
    )
    assert r.status_code == 403

    yes = await _member_headers(
        db_session, test_workspace, email="yc@example.com", can_create_numerators=True
    )
    r2 = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators", json={"key": "b", "name": "B"}, headers=yes
    )
    assert r2.status_code == 201, r2.text


async def test_member_write_gated(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    num = await _create(authenticated_client, test_workspace)
    no = await _member_headers(
        db_session, test_workspace, email="nw@example.com", can_write_numerators=False
    )
    r = await authenticated_client.post(
        f"{_ws(test_workspace)}/numerators/{num['id']}/reserve", headers=no
    )
    assert r.status_code == 403


async def test_member_read_gated(
    authenticated_client: AsyncClient, db_session: AsyncSession, test_workspace
):
    await _create(authenticated_client, test_workspace)
    no = await _member_headers(
        db_session, test_workspace, email="nr@example.com", can_read_numerators=False
    )
    r = await authenticated_client.get(f"{_ws(test_workspace)}/numerators", headers=no)
    assert r.status_code == 403
