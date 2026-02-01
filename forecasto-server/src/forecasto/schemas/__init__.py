"""Pydantic schemas for Forecasto API."""

from __future__ import annotations


from forecasto.schemas.auth import LoginRequest, LoginResponse, RefreshRequest, TokenResponse
from forecasto.schemas.bank_account import (
    BalanceCreate,
    BalanceResponse,
    BankAccountCreate,
    BankAccountResponse,
    BankAccountUpdate,
)
from forecasto.schemas.cashflow import CashflowEntry, CashflowRequest, CashflowResponse
from forecasto.schemas.common import ErrorResponse, PaginatedResponse, SuccessResponse
from forecasto.schemas.project import (
    PhaseCreate,
    PhaseResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from forecasto.schemas.record import (
    RecordCreate,
    RecordFilter,
    RecordResponse,
    RecordUpdate,
)
from forecasto.schemas.session import (
    ConflictResponse,
    MessageCreate,
    MessageResponse,
    OperationResponse,
    SessionCreate,
    SessionResponse,
)
from forecasto.schemas.user import UserCreate, UserResponse, UserUpdate
from forecasto.schemas.workspace import (
    InvitationCreate,
    MemberResponse,
    MemberUpdate,
    WorkspaceCreate,
    WorkspaceResponse,
)

__all__ = [
    "SuccessResponse",
    "ErrorResponse",
    "PaginatedResponse",
    "LoginRequest",
    "LoginResponse",
    "RefreshRequest",
    "TokenResponse",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "WorkspaceCreate",
    "WorkspaceResponse",
    "MemberResponse",
    "MemberUpdate",
    "InvitationCreate",
    "SessionCreate",
    "SessionResponse",
    "MessageCreate",
    "MessageResponse",
    "OperationResponse",
    "ConflictResponse",
    "RecordCreate",
    "RecordUpdate",
    "RecordResponse",
    "RecordFilter",
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectResponse",
    "PhaseCreate",
    "PhaseResponse",
    "BankAccountCreate",
    "BankAccountUpdate",
    "BankAccountResponse",
    "BalanceCreate",
    "BalanceResponse",
    "CashflowRequest",
    "CashflowResponse",
    "CashflowEntry",
]

