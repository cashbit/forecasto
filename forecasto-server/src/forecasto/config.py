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

    # CORS
    cors_origins: str = "*"  # Comma-separated origins, or "*" for all

    # Sessions
    session_idle_timeout_minutes: int = 30
    session_expire_timeout_hours: int = 4
    session_cleanup_days: int = 7

    # Document processing
    anthropic_api_key: str = ""
    document_upload_dir: str = "./uploads"
    document_max_size_mb: int = 20
    document_default_model: str = "claude-sonnet-4-6"
    processing_max_concurrent: int = 2
    processing_max_queue_size: int = 50

    # Inbox file retention
    # - Confirmed items: file deleted immediately at confirm time.
    # - Rejected items: file deleted after `inbox_rejected_retention_days` days.
    # - Cleanup scheduler runs every `inbox_cleanup_interval_minutes` minutes.
    inbox_rejected_retention_days: int = 7
    inbox_cleanup_interval_minutes: int = 60

    # Agente-zero (incremental note analysis → dashboard highlights)
    agent_zero_enabled: bool = True
    agent_zero_model: str = "claude-haiku-4-5-20251001"
    # Wait this long after a record was last touched before (re)analyzing it,
    # so rapid edits don't trigger repeated LLM calls.
    agent_zero_delay_seconds: int = 300
    # Scheduler poll interval.
    agent_zero_poll_seconds: int = 60
    # How many records per LLM call.
    agent_zero_batch_size: int = 15
    # Safety cap on records analyzed per scheduler pass.
    agent_zero_max_per_pass: int = 60

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "env_ignore_empty": True,
    }

settings = Settings()
