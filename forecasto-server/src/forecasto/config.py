"""Application configuration using pydantic-settings."""

from __future__ import annotations


from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "sqlite+aiosqlite:///./forecasto.db"

    # Auth
    secret_key: str = "change-me-in-production-use-a-secure-random-key"
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    refresh_token_expire_days: int = 30

    # Sessions
    session_idle_timeout_minutes: int = 30
    session_expire_timeout_hours: int = 4
    session_cleanup_days: int = 7

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

settings = Settings()
