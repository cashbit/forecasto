"""API routers for Forecasto."""

from __future__ import annotations


from forecasto.api import (
    auth,
    bank_accounts,
    cashflow,
    collections,
    document_upload,
    inbox,
    partner,
    prompt_builder,
    records,
    sessions,
    transfers,
    usage,
    users,
    vat,
    vat_registry,
    workspaces,
)

__all__ = [
    "auth",
    "users",
    "workspaces",
    "sessions",
    "records",
    "transfers",
    "bank_accounts",
    "cashflow",
    "partner",
    "vat",
    "vat_registry",
    "inbox",
    "collections",
    "document_upload",
    "usage",
    "prompt_builder",
]

