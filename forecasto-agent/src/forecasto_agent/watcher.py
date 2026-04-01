"""Watchdog-based folder watcher.

Watches all configured folders and enqueues new/modified files.
Runs in a background thread (watchdog uses threading internally).
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from forecasto_agent import cache as file_cache
from forecasto_agent.config import AgentConfig
from forecasto_agent.queue_manager import DocumentQueue, SUPPORTED_EXTENSIONS, sha256_file

logger = logging.getLogger(__name__)

# Ignore hidden directories (like .forecasto-agent itself)
IGNORED_DIRS = {".forecasto-agent", ".git", "__pycache__", ".DS_Store"}


class FolderEventHandler(FileSystemEventHandler):
    def __init__(self, queue: DocumentQueue, config: AgentConfig, loop):
        super().__init__()
        self._queue = queue
        self._config = config
        self._loop = loop

    def _should_ignore(self, path: str) -> bool:
        p = Path(path)
        # Ignore hidden folders
        for part in p.parts:
            if part in IGNORED_DIRS or part.startswith("."):
                return True
        return p.suffix.lower() not in SUPPORTED_EXTENSIONS

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        path = Path(event.src_path)
        logger.debug("Created: %s", path.name)
        # Schedule enqueue in asyncio event loop (watchdog runs in a thread)
        self._loop.call_soon_threadsafe(self._queue.enqueue, path)

    def on_modified(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        path = Path(event.src_path)
        logger.debug("Modified: %s", path.name)
        self._loop.call_soon_threadsafe(self._queue.enqueue, path)

    def on_deleted(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        path = Path(event.src_path)
        logger.debug("Deleted: %s", path.name)

        # Find workspace for this folder
        for folder in self._config.watched_folders:
            try:
                path.relative_to(folder.path)
                # Can't hash the file (it's deleted), look up cached hash
                file_hash = _lookup_hash_for_path(str(path))
                if file_hash:
                    self._loop.call_soon_threadsafe(
                        self._queue.enqueue_delete, file_hash, folder.workspace_id
                    )
                break
            except ValueError:
                continue


def _lookup_hash_for_path(file_path: str) -> str | None:
    """Look up the last known hash for a file path from the cache."""
    import sqlite3
    from forecasto_agent.cache import CACHE_DB
    if not CACHE_DB.exists():
        return None
    with sqlite3.connect(str(CACHE_DB)) as conn:
        row = conn.execute(
            "SELECT file_hash FROM file_cache WHERE file_path = ? ORDER BY rowid DESC LIMIT 1",
            (file_path,),
        ).fetchone()
    return row[0] if row else None


class FolderWatcher:
    def __init__(self, queue: DocumentQueue, config: AgentConfig, loop):
        self._queue = queue
        self._config = config
        self._loop = loop
        self._observer = Observer()

    def start(self) -> None:
        handler = FolderEventHandler(self._queue, self._config, self._loop)
        for folder in self._config.watched_folders:
            if folder.path.is_dir():
                self._observer.schedule(handler, str(folder.path), recursive=False)
                logger.info("Watching: %s", folder.path)
            else:
                logger.warning("Watched folder does not exist: %s", folder.path)
        self._observer.start()

    def stop(self) -> None:
        self._observer.stop()
        self._observer.join()
