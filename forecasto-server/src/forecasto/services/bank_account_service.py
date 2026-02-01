"""Bank account service."""

from __future__ import annotations


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import NotFoundException, ValidationException
from forecasto.models.bank_account import BankAccount, BankAccountBalance
from forecasto.models.user import User
from forecasto.schemas.bank_account import BalanceCreate, BankAccountCreate, BankAccountUpdate

class BankAccountService:
    """Service for bank account operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_accounts(
        self, workspace_id: str, active_only: bool = True
    ) -> list[BankAccount]:
        """List bank accounts for a workspace."""
        query = select(BankAccount).where(BankAccount.workspace_id == workspace_id)

        if active_only:
            query = query.where(BankAccount.is_active == True)  # noqa: E712

        query = query.order_by(BankAccount.is_default.desc(), BankAccount.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_account(
        self, workspace_id: str, data: BankAccountCreate
    ) -> BankAccount:
        """Create a new bank account."""
        # Check unique IBAN
        if data.iban:
            result = await self.db.execute(
                select(BankAccount).where(
                    BankAccount.workspace_id == workspace_id,
                    BankAccount.iban == data.iban,
                )
            )
            if result.scalar_one_or_none():
                raise ValidationException(f"IBAN '{data.iban}' already exists")

        # If this is default, unset others
        if data.is_default:
            result = await self.db.execute(
                select(BankAccount).where(
                    BankAccount.workspace_id == workspace_id,
                    BankAccount.is_default == True,  # noqa: E712
                )
            )
            for account in result.scalars().all():
                account.is_default = False

        account = BankAccount(
            workspace_id=workspace_id,
            name=data.name,
            iban=data.iban,
            bic_swift=data.bic_swift,
            bank_name=data.bank_name,
            currency=data.currency,
            credit_limit=data.credit_limit,
            is_default=data.is_default,
            settings=data.settings or {},
        )
        self.db.add(account)
        return account

    async def get_account(self, account_id: str, workspace_id: str) -> BankAccount:
        """Get bank account by ID."""
        result = await self.db.execute(
            select(BankAccount).where(
                BankAccount.id == account_id,
                BankAccount.workspace_id == workspace_id,
            )
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

        # Handle is_default change
        if update_data.get("is_default") is True and not account.is_default:
            result = await self.db.execute(
                select(BankAccount).where(
                    BankAccount.workspace_id == account.workspace_id,
                    BankAccount.is_default == True,  # noqa: E712
                )
            )
            for other in result.scalars().all():
                other.is_default = False

        for key, value in update_data.items():
            if hasattr(account, key):
                setattr(account, key, value)

        return account

    async def add_balance(
        self, account: BankAccount, data: BalanceCreate, user: User
    ) -> BankAccountBalance:
        """Add a balance record."""
        # Check if balance exists for date
        result = await self.db.execute(
            select(BankAccountBalance).where(
                BankAccountBalance.bank_account_id == account.id,
                BankAccountBalance.balance_date == data.balance_date,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing
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
