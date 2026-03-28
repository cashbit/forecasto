"""VAT Registry CRUD endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
from forecasto.models.user import User
from forecasto.schemas.vat_registry import (
    VatBalanceCreate,
    VatBalanceResponse,
    VatBalanceUpdate,
    VatRegistryCreate,
    VatRegistryResponse,
    VatRegistryUpdate,
)
from forecasto.services.event_bus import event_bus
from forecasto.services.vat_registry_service import VatRegistryService

router = APIRouter()


# ── Registry CRUD ──────────────────────────────────────────────────────

@router.get("/vat-registries", response_model=list[VatRegistryResponse])
async def list_registries(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all VAT registries owned by the current user."""
    service = VatRegistryService(db)
    registries = await service.list_registries(current_user)
    return registries


@router.post("/vat-registries", response_model=VatRegistryResponse, status_code=201)
async def create_registry(
    data: VatRegistryCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new VAT registry."""
    service = VatRegistryService(db)
    registry = await service.create_registry(data, current_user)
    await db.commit()
    await event_bus.publish("vat_changed", data={"action": "registry_create"})
    return registry


@router.get("/vat-registries/{registry_id}", response_model=VatRegistryResponse)
async def get_registry(
    registry_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a VAT registry by ID."""
    service = VatRegistryService(db)
    return await service.get_registry(registry_id, current_user)


@router.patch("/vat-registries/{registry_id}", response_model=VatRegistryResponse)
async def update_registry(
    registry_id: str,
    data: VatRegistryUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a VAT registry."""
    service = VatRegistryService(db)
    registry = await service.update_registry(registry_id, data, current_user)
    await db.commit()
    await event_bus.publish("vat_changed", data={"action": "registry_update"})
    return registry


@router.delete("/vat-registries/{registry_id}", status_code=204)
async def delete_registry(
    registry_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a VAT registry."""
    service = VatRegistryService(db)
    await service.delete_registry(registry_id, current_user)
    await db.commit()
    await event_bus.publish("vat_changed", data={"action": "registry_delete"})


# ── Balance CRUD ───────────────────────────────────────────────────────

@router.get(
    "/vat-registries/{registry_id}/balances",
    response_model=list[VatBalanceResponse],
)
async def list_balances(
    registry_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List balance entries for a VAT registry."""
    service = VatRegistryService(db)
    return await service.list_balances(registry_id, current_user)


@router.post(
    "/vat-registries/{registry_id}/balances",
    response_model=VatBalanceResponse,
    status_code=201,
)
async def create_balance(
    registry_id: str,
    data: VatBalanceCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add a balance entry to a VAT registry."""
    service = VatRegistryService(db)
    balance = await service.create_balance(registry_id, data, current_user)
    await db.commit()
    await event_bus.publish("vat_changed", data={"action": "balance_create"})
    return balance


@router.patch(
    "/vat-registries/{registry_id}/balances/{balance_id}",
    response_model=VatBalanceResponse,
)
async def update_balance(
    registry_id: str,
    balance_id: str,
    data: VatBalanceUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a balance entry."""
    service = VatRegistryService(db)
    balance = await service.update_balance(registry_id, balance_id, data, current_user)
    await db.commit()
    await event_bus.publish("vat_changed", data={"action": "balance_update"})
    return balance


@router.delete(
    "/vat-registries/{registry_id}/balances/{balance_id}",
    status_code=204,
)
async def delete_balance(
    registry_id: str,
    balance_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a balance entry."""
    service = VatRegistryService(db)
    await service.delete_balance(registry_id, balance_id, current_user)
    await db.commit()
    await event_bus.publish("vat_changed", data={"action": "balance_delete"})
