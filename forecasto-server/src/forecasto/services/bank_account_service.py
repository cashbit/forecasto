"""Bank account service."""

from __future__ import annotations


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ForbiddenException, NotFoundException, ValidationException
from forecasto.models.bank_account import BankAccount, BankAccountBalance
from forecasto.models.user import User
from forecasto.models.workspace import Workspace
from forecasto.schemas.bank_account import BalanceCreate, BankAccountCreate, BankAccountUpdate

class BankAccountService:
    """Service for bank account operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # --- User-level operations ---

    async def list_user_accounts(
        self, owner_id: str, active_only: bool = True
    ) -> list[BankAccount]:
        """List bank accounts owned by a user."""
        query = select(BankAccount).where(BankAccount.owner_id == owner_id)

        if active_only:
            query = query.where(BankAccount.is_active == True)  # noqa: E712

        query = query.order_by(BankAccount.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_account(
        self, owner_id: str, data: BankAccountCreate
    ) -> BankAccount:
        """Create a new bank account for a user."""
        account = BankAccount(
            owner_id=owner_id,
            name=data.name,
            bank_name=data.bank_name,
            description=data.description,
            currency=data.currency,
            credit_limit=data.credit_limit,
            settings=data.settings or {"color": "#1E88E5", "icon": "bank", "show_in_cashflow": True},
        )
        self.db.add(account)
        return account

    async def get_account(self, account_id: str) -> BankAccount:
        """Get bank account by ID."""
        result = await self.db.execute(
            select(BankAccount).where(BankAccount.id == account_id)
        )
        account = result.scalar_one_or_none()
        if not account:
            raise NotFoundException(f"Bank account {account_id} not found")
        return account

    async def update_account(
        self, account: BankAccount, data: BankAccountUpdate
    ) -> BankAccount:
        """Update a bank account."""
        update_data = data.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            if hasattr(account, key):
                setattr(account, key, value)

        return account

    # --- Workspace bank account operations (1-to-1) ---

    async def get_workspace_account(
        self, workspace_id: str
    ) -> BankAccount | None:
        """Get the bank account associated with a workspace."""
        result = await self.db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            raise NotFoundException(f"Workspace {workspace_id} not found")

        if not workspace.bank_account_id:
            return None

        result = await self.db.execute(
            select(BankAccount).where(BankAccount.id == workspace.bank_account_id)
        )
        return result.scalar_one_or_none()

    async def set_workspace_account(
        self, workspace_id: str, bank_account_id: str
    ) -> BankAccount:
        """Set the bank account for a workspace (replaces any existing)."""
        result = await self.db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            raise NotFoundException(f"Workspace {workspace_id} not found")

        # Verify the bank account exists
        account = await self.get_account(bank_account_id)

        workspace.bank_account_id = bank_account_id
        return account

    async def unset_workspace_account(
        self, workspace_id: str
    ) -> None:
        """Remove the bank account association from a workspace."""
        result = await self.db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            raise NotFoundException(f"Workspace {workspace_id} not found")

        workspace.bank_account_id = None

    # --- Balance operations ---

    async def add_balance(
        self, account: BankAccount, data: BalanceCreate, user: User
    ) -> BankAccountBalance:
        """Add a balance record."""
        result = await self.db.execute(
            select(BankAccountBalance).where(
                BankAccountBalance.bank_account_id == account.id,
                BankAccountBalance.balance_date == data.balance_date,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.balance = data.balance
            existing.source = data.source
            existing.note = data.note
            existing.recorded_by = user.id
            return existing

        balance = BankAccountBalance(
            bank_account_id=account.id,
            balance_date=data.balance_date,
            balance=data.balance,
            source=data.source,
            note=data.note,
            recorded_by=user.id,
        )
        self.db.add(balance)
        return balance

    async def get_balances(
        self,
        account_id: str,
        from_date=None,
        to_date=None,
    ) -> list[BankAccountBalance]:
        """Get balance history for an account."""
        query = select(BankAccountBalance).where(
            BankAccountBalance.bank_account_id == account_id
        )

        if from_date:
            query = query.where(BankAccountBalance.balance_date >= from_date)
        if to_date:
            query = query.where(BankAccountBalance.balance_date <= to_date)

        query = query.order_by(BankAccountBalance.balance_date.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_balance_at_date(self, account_id: str, date) -> BankAccountBalance | None:
        """Get the balance closest to a specific date."""
        result = await self.db.execute(
            select(BankAccountBalance)
            .where(
                BankAccountBalance.bank_account_id == account_id,
                BankAccountBalance.balance_date <= date,
            )
            .order_by(BankAccountBalance.balance_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
