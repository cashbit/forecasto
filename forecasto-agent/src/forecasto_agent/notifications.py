"""Desktop notifications — cross-platform with platform-specific backends."""

from __future__ import annotations

import logging
import platform
import subprocess

logger = logging.getLogger(__name__)

APP_NAME = "Forecasto Agent"


def _notify_macos(title: str, message: str) -> None:
    """Use osascript for macOS notifications (no extra dependencies)."""
    script = f'display notification "{message}" with title "{title}"'
    subprocess.run(["osascript", "-e", script], check=False, capture_output=True)


def _notify_generic(title: str, message: str, timeout: int) -> None:
    """Fallback via plyer (Windows/Linux)."""
    try:
        from plyer import notification
        notification.notify(title=title, message=message, app_name=APP_NAME, timeout=timeout)
    except Exception as exc:
        logger.debug("Desktop notification failed: %s", exc)


def notify(title: str, message: str, timeout: int = 6) -> None:
    """Send a desktop notification."""
    try:
        if platform.system() == "Darwin":
            _notify_macos(title, message)
        else:
            _notify_generic(title, message, timeout)
    except Exception as exc:
        logger.debug("Notification error: %s", exc)


def notify_documents_processed(count: int) -> None:
    noun = "documento" if count == 1 else "documenti"
    notify(
        title=f"Forecasto — {count} {noun} elaborati",
        message="Apri l'inbox su app.forecasto.it per confermare",
    )


def notify_startup(folder_count: int) -> None:
    notify(
        title="Forecasto Agent avviato",
        message=f"Monitoraggio di {folder_count} cartel{'la' if folder_count == 1 else 'le'} attivo",
        timeout=4,
    )
