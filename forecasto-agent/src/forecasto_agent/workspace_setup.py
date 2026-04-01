"""Workspace subfolder setup — auto-creates one subfolder per workspace."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

_CONFIG_FILES = ("config.toml", "system-prompt.md", "user-prompt.md")


async def setup_workspace_folders(
    root_path: Path,
    workspaces: list[dict],
    parent_config_dir: Path | None = None,
) -> list[tuple[Path, str]]:
    """Create <root_path>/<workspace_name>/ for each workspace.

    If parent_config_dir is provided, its config files are copied into each new
    subfolder's .forecasto-agent/ directory so LLM settings are inherited.

    Returns list of (folder_path, workspace_id) tuples.
    """
    root_path = root_path.expanduser().resolve()
    if not root_path.is_dir():
        logger.error("Root path does not exist: %s", root_path)
        return []

    result = []
    for ws in workspaces:
        ws_id = ws["id"]
        ws_name = ws["name"]
        # Sanitize folder name (keep alphanumeric, spaces, dash, underscore)
        safe_name = "".join(
            c if c.isalnum() or c in " _-" else "_" for c in ws_name
        ).strip()
        folder = root_path / safe_name
        folder.mkdir(exist_ok=True)

        config_dir = folder / ".forecasto-agent"
        config_dir.mkdir(exist_ok=True)

        # Write workspace_id marker
        id_file = config_dir / "workspace_id"
        id_file.write_text(ws_id, encoding="utf-8")  # always update

        # Copy parent config files if they exist and subfolder has none yet
        if parent_config_dir and parent_config_dir.is_dir():
            for fname in _CONFIG_FILES:
                src = parent_config_dir / fname
                dst = config_dir / fname
                if src.exists() and not dst.exists():
                    shutil.copy2(src, dst)
                    logger.debug("Copied %s → %s", src, dst)

        logger.info("Workspace folder ready: %s (workspace %s)", folder, ws_id)
        result.append((folder, ws_id))

    return result
