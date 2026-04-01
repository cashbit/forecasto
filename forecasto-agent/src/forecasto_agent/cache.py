"""Local SQLite cache: tracks processed files to avoid reprocessing.

Schema:
  file_path TEXT PRIMARY KEY
  file_hash TEXT NOT NULL           -- SHA256 of file contents
  inbox_item_id TEXT                -- ID returned by the server
  status TEXT NOT NULL DEFAULT 'processing'  -- processing | sent | error
  processed_at TEXT NOT NULL        -- ISO datetime
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


CACHE_DIR = Path.home() / ".forecasto-agent"
CACHE_DB = CACHE_DIR / "cache.db"


def _get_conn() -> sqlite3.Connection:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CACHE_DB))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS file_cache (
            file_path TEXT PRIMARY KEY,
            file_hash TEXT NOT NULL,
            inbox_item_id TEXT,
            status TEXT NOT NULL DEFAULT 'processing',
            processed_at TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def is_already_processed(file_path: str, file_hash: str) -> bool:
    """Return True if this file (same path + same hash) was already sent successfully."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT status FROM file_cache WHERE file_path = ? AND file_hash = ?",
            (file_path, file_hash),
        ).fetchone()
        return row is not None and row["status"] == "sent"


def mark_processing(file_path: str, file_hash: str) -> None:
    with _get_conn() as conn:
        conn.execute("""
            INSERT INTO file_cache (file_path, file_hash, status, processed_at)
            VALUES (?, ?, 'processing', ?)
            ON CONFLICT(file_path) DO UPDATE SET
                file_hash = excluded.file_hash,
                status = 'processing',
                processed_at = excluded.processed_at
        """, (file_path, file_hash, datetime.now(timezone.utc).isoformat()))
        conn.commit()


def mark_sent(file_path: str, file_hash: str, inbox_item_id: str) -> None:
    with _get_conn() as conn:
        conn.execute("""
            UPDATE file_cache SET status = 'sent', inbox_item_id = ?
            WHERE file_path = ? AND file_hash = ?
        """, (inbox_item_id, file_path, file_hash))
        conn.commit()


def mark_error(file_path: str, file_hash: str) -> None:
    with _get_conn() as conn:
        conn.execute("""
            UPDATE file_cache SET status = 'error'
            WHERE file_path = ? AND file_hash = ?
        """, (file_path, file_hash))
        conn.commit()


def get_item_id_for_hash(file_hash: str) -> str | None:
    """Return inbox_item_id for a given file hash (for delete notifications)."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT inbox_item_id FROM file_cache WHERE file_hash = ? AND status = 'sent'",
            (file_hash,),
        ).fetchone()
        return row["inbox_item_id"] if row else None
