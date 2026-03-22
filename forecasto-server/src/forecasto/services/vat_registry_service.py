"""VAT Registry CRUD service."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forecasto.exceptions import ForbiddenException, NotFoundException
from forecasto.models.user import User
from forecasto.models.vat_registry import VatBalance, VatRegistry
from forecasto.schemas.vat_registry import (
    VatBalanceCreate,
    VatBalanceUpdate,
    VatRegistryCreate,
    VatRegistryUpdate,
)

logger = logging.getLogger(__name__)


class VatRegistryService:
    """CRUD operations for VAT registries and balances."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Registry CRUD ──────────────────────────────────────────────────

    async def list_registries(self, user: User) -> list[VatRegistry]:
        """List all VAT registries owned by the user."""
        result = await self.db.execute(
            select(VatRegistry)
            .where(VatRegistry.owner_id == user.id)
            .order_by(VatRegistry.name)
        )
        return list(result.scalars().all())

    async def get_registry(self, registry_id: str, user: User) -> VatRegistry:
        """Get a registry by ID, checking ownership."""
        result = await self.db.execute(
            select(VatRegistry).where(VatRegistry.id == registry_id)
        )
        registry = result.scalar_one_or_none()
        if not registry:
            raise NotFoundException(f"VAT registry {registry_id} not found")
        if registry.owner_id != user.id:
            raise ForbiddenException("Not the owner of this VAT registry")
        return registry

    async def create_registry(self, data: VatRegistryCreate, user: User) -> VatRegistry:
        """Create a new VAT registry."""
        registry = VatRegistry(
            owner_id=user.id,
            name=data.name,
            vat_number=data.vat_number,
            bank_account_id=data.bank_account_id,
        )
        self.db.add(registry)
        await self.db.flush()
        return registry

    async def update_registry(
        self, registry_id: str, data: VatRegistryUpdate, user: User
    ) -> VatRegistry:
        """Update a VAT registry."""
        registry = await self.get_registry(registry_id, user)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(registry, key, value)
        await self.db.flush()
        return registry

    async def delete_registry(self, registry_id: str, user: User) -> None:
        """Delete a VAT registry (cascades to balances, sets workspaces FK to null)."""
        registry = await self.get_registry(registry_id, user)
        await self.db.delete(registry)
        await self.db.flush()

    # ── Balance CRUD ───────────────────────────────────────────────────

    async def list_balances(self, registry_id: str, user: User) -> list[VatBalance]:
        """List balances for a registry."""
        await self.get_registry(registry_id, user)  # ownership check
        result = await self.db.execute(
            select(VatBalance)
            .where(VatBalance.vat_registry_id == registry_id)
            .order_by(VatBalance.month.desc())
        )
        return list(result.scalars().all())

    async def create_balance(
        self, registry_id: str, data: VatBalanceCreate, user: User
    ) -> VatBalance:
        """Create a balance entry."""
        await self.get_registry(registry_id, user)  # ownership check
        balance = VatBalance(
            vat_registry_id=registry_id,
            month=data.month,
            amount=data.amount,
            note=data.note,
        )
        self.db.add(balance)
        await self.db.flush()
        return balance

    async def update_balance(
        self, registry_id: str, balance_id: str, data: VatBalanceUpdate, user: User
    ) -> VatBalance:
        """Update a balance entry."""
        await self.get_registry(registry_id, user)  # ownership check
        result = await self.db.execute(
            select(VatBalance).where(
                VatBalance.id == balance_id,
                VatBalance.vat_registry_id == registry_id,
            )
        )
        balance = result.scalar_one_or_none()
        if not balance:
            raise NotFoundException(f"VAT balance {balance_id} not found")
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(balance, key, value)
        await self.db.flush()
        return balance

    async def delete_balance(
        self, registry_id: str, balance_id: str, user: User
    ) -> None:
        """Delete a balance entry."""
        await self.get_registry(registry_id, user)  # ownership check
        result = await self.db.execute(
            select(VatBalance).where(
                VatBalance.id == balance_id,
                VatBalance.vat_registry_id == registry_id,
            )
        )
        balance = result.scalar_one_or_none()
        if not balance:
            raise NotFoundException(f"VAT balance {balance_id} not found")
        await self.db.delete(balance)
        await self.db.flush()
