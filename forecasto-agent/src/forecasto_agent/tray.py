"""System tray icon via pystray (cross-platform: macOS, Windows, Linux/X11).

- Shows a document icon with a badge counter when items are pending
- Click → opens browser on /inbox
- Right-click menu: Open inbox | Stop agent
"""

from __future__ import annotations

import logging
import threading
import webbrowser
from pathlib import Path

logger = logging.getLogger(__name__)

_icon_instance = None
_pending_count = 0
_inbox_url = "https://app.forecasto.it/inbox"


def _make_icon_image(count: int):
    """Generate a simple tray icon image (PIL Image).

    Falls back to a plain colored square if icon assets are unavailable.
    """
    from PIL import Image, ImageDraw, ImageFont

    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Blue circle background
    draw.ellipse([4, 4, size - 4, size - 4], fill=(59, 130, 246, 255))

    # "F" letter
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    except Exception:
        font = ImageFont.load_default()
    draw.text((size // 2, size // 2), "F", fill="white", font=font, anchor="mm")

    # Red badge with count
    if count > 0:
        badge_r = 14
        bx, by = size - badge_r - 2, badge_r + 2
        draw.ellipse([bx - badge_r, by - badge_r, bx + badge_r, by + badge_r], fill=(239, 68, 68, 255))
        badge_text = str(count) if count < 100 else "99+"
        try:
            badge_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
        except Exception:
            badge_font = ImageFont.load_default()
        draw.text((bx, by), badge_text, fill="white", font=badge_font, anchor="mm")

    return img


def _open_inbox(icon=None, item=None) -> None:
    webbrowser.open(_inbox_url)


def _stop_agent(icon=None, item=None) -> None:
    if icon is not None:
        icon.stop()


def run_tray_main(inbox_url: str, stop_event: threading.Event) -> None:
    """Run the system tray icon on the CURRENT (main) thread. Blocks until stopped.

    Must be called from the main thread on macOS.
    Falls back to a simple wait loop if pystray is unavailable.
    """
    global _inbox_url, _icon_instance

    _inbox_url = inbox_url

    try:
        import pystray

        icon = pystray.Icon(
            "forecasto-agent",
            _make_icon_image(0),
            "Forecasto Agent",
            menu=pystray.Menu(
                pystray.MenuItem("Apri inbox", _open_inbox, default=True),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Ferma agente", _stop_agent),
            ),
        )
        _icon_instance = icon

        def setup(icon):
            # Background thread polls stop_event and calls icon.stop()
            def _poll():
                while not stop_event.is_set():
                    import time
                    time.sleep(0.5)
                icon.stop()
            t = threading.Thread(target=_poll, daemon=True)
            t.start()

        icon.run(setup=setup)  # blocks main thread until icon.stop()

    except Exception as exc:
        logger.warning("System tray unavailable: %s — running without tray", exc)
        # Fallback: block main thread waiting for stop_event
        try:
            stop_event.wait()
        except KeyboardInterrupt:
            stop_event.set()


def update_badge(count: int) -> None:
    """Update the tray icon badge count."""
    global _pending_count, _icon_instance
    _pending_count = count
    if _icon_instance is not None:
        try:
            _icon_instance.icon = _make_icon_image(count)
            _icon_instance.title = f"Forecasto Agent — {count} in attesa" if count > 0 else "Forecasto Agent"
        except Exception as exc:
            logger.debug("Failed to update tray icon: %s", exc)
