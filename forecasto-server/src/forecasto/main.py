"""FastAPI application entry point."""

from __future__ import annotations


from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import select

from forecasto.api import (
    admin,
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
from forecasto.database import async_session_maker, init_db
from forecasto.exceptions import ForecastoException
from forecasto.models.user import User
from forecasto.utils.security import hash_password

async def seed_default_admin():
    """Seed a default admin user if no admin exists."""
    async with async_session_maker() as db:
        # Check if any admin exists
        result = await db.execute(
            select(User).where(User.is_admin == True)  # noqa: E712
        )
        existing_admin = result.scalar_one_or_none()

        if not existing_admin:
            # Create default admin
            admin_user = User(
                email="admin@forecasto.app",
                password_hash=hash_password("changeme123"),
                name="Administrator",
                is_admin=True,
                must_change_password=True,
            )
            db.add(admin_user)
            await db.commit()
            print("Default admin user created: admin@forecasto.app / changeme123")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""

    await init_db()
    await seed_default_admin()
    yield

app = FastAPI(
    title="Forecasto API",
    description="Financial forecasting and cashflow management API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: specify allowed domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
@app.exception_handler(ForecastoException)
async def forecasto_exception_handler(request: Request, exc: ForecastoException):
    """Handle custom Forecasto exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.message,
            "error_code": exc.error_code,
            "details": exc.details,
        },
    )

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(workspaces.router, prefix="/api/v1/workspaces", tags=["Workspaces"])
app.include_router(sessions.router, prefix="/api/v1/workspaces", tags=["Sessions"])
app.include_router(records.router, prefix="/api/v1/workspaces", tags=["Records"])
app.include_router(transfers.router, prefix="/api/v1/workspaces", tags=["Transfers"])
app.include_router(projects.router, prefix="/api/v1/workspaces", tags=["Projects"])
app.include_router(
    bank_accounts.user_router, prefix="/api/v1/bank-accounts", tags=["Bank Accounts"]
)
app.include_router(
    bank_accounts.router, prefix="/api/v1/workspaces", tags=["Bank Accounts"]
)
app.include_router(cashflow.router, prefix="/api/v1", tags=["Cashflow"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Forecasto API",
        "version": "1.0.0",
        "docs": "/docs",
    }
