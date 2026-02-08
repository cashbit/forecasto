"""API routers for Forecasto."""

from __future__ import annotations


from forecasto.api import (
    auth,
    bank_accounts,
    cashflow,
    projects,
    records,
    sessions,
    transfers,
    users,
    workspaces,
)

__all__ = [
    "auth",
    "users",
    "workspaces",
    "sessions",
    "records",
    "transfers",
    "projects",
    "bank_accounts",
    "cashflow",
]

