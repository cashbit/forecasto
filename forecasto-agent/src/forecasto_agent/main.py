"""Forecasto Agent — CLI entry point.

Commands:
  forecasto-agent start   — start the agent (watches folders, system tray)
  forecasto-agent status  — show current config + cache stats
  forecasto-agent init    — write example config to ~/.forecasto-agent/config.toml
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import threading
from pathlib import Path

import click

from forecasto_agent.config import AgentConfig, GLOBAL_CONFIG_FILE
from forecasto_agent.queue_manager import DocumentQueue
from forecasto_agent.watcher import FolderWatcher

logger = logging.getLogger("forecasto_agent")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)


@click.group()
def cli():
    """Forecasto Agent — monitors folders and processes documents with AI."""
    pass


@cli.command()
def init():
    """Write an example config to ~/.forecasto-agent/config.toml."""
    config = AgentConfig()
    config.write_example()
    if GLOBAL_CONFIG_FILE.exists():
        click.echo(f"Config file ready: {GLOBAL_CONFIG_FILE}")
        click.echo("Edit it to add your API key and watched folders.")
    else:
        click.echo("Config already exists, not overwritten.")


@cli.command()
def status():
    """Show current configuration and cache statistics."""
    import sqlite3
    from forecasto_agent.cache import CACHE_DB

    config = AgentConfig.load()
    click.echo(f"Server: {config.server.base_url}")
    click.echo(f"Agent token: {'set' if config.agent_token else 'NOT SET'}")
    click.echo(f"API key: {'set' if config.server.api_key else 'NOT SET'}")
    if config.watch_root_path:
        click.echo(f"Watch root: {config.watch_root_path}")
    click.echo(f"Watched folders ({len(config.watched_folders)}):")
    for f in config.watched_folders:
        click.echo(f"  {f.path}  →  workspace {f.workspace_id}  [{f.llm.provider}/{f.llm.model}]")

    if CACHE_DB.exists():
        with sqlite3.connect(str(CACHE_DB)) as conn:
            rows = conn.execute("SELECT status, COUNT(*) FROM file_cache GROUP BY status").fetchall()
        click.echo("\nCache:")
        for status_val, count in rows:
            click.echo(f"  {status_val}: {count}")
    else:
        click.echo("\nCache: empty")


@cli.command()
@click.option("--no-tray", is_flag=True, help="Disable system tray icon")
def start(no_tray: bool):
    """Start the agent: watch folders and process documents."""
    config = AgentConfig.load()

    if not config.agent_token and not config.server.api_key:
        click.echo("ERROR: No agent_token or api_key configured. Run 'forecasto-agent init' then edit the config.", err=True)
        sys.exit(1)

    # Auto-discover workspaces and create subfolders when agent_token is set.
    # Root path priority:
    #   1. watch.root_path from config (explicit)
    #   2. first watched_folder path (implicit — subfolders created inside it)
    if config.agent_token:
        _root_str = config.watch_root_path or (
            str(config.watched_folders[0].path) if config.watched_folders else None
        )
        if _root_str:
            from forecasto_agent.workspace_setup import setup_workspace_folders
            from forecasto_agent.api.client import ForecastoClient
            try:
                disc_client = ForecastoClient(
                    base_url=config.server.base_url,
                    agent_token=config.agent_token,
                )
                disc_loop = asyncio.new_event_loop()
                workspaces = disc_loop.run_until_complete(disc_client.list_workspaces())
                root = Path(_root_str).expanduser().resolve()
                # Pass the parent's .forecasto-agent/ dir so config is inherited
                parent_cfg_dir = root / ".forecasto-agent" if (root / ".forecasto-agent").is_dir() else None
                folders = disc_loop.run_until_complete(
                    setup_workspace_folders(root, workspaces, parent_config_dir=parent_cfg_dir)
                )
                disc_loop.close()
                # Add discovered folders to config using WatchedFolder.load()
                # so per-folder config (LLM key, system prompt) is applied
                existing_paths = {str(f.path) for f in config.watched_folders}
                added = 0
                for folder_path, ws_id in folders:
                    if str(folder_path) not in existing_paths:
                        from forecasto_agent.config import WatchedFolder
                        wf = WatchedFolder.load(
                            path=folder_path,
                            workspace_id=ws_id,
                            global_server=config.server,
                            global_agent_token=config.agent_token,
                        )
                        config.watched_folders.append(wf)
                        added += 1
                click.echo(f"[agent] {len(folders)} workspace folder(s) ready (+{added} nuove)")
            except Exception as e:
                click.echo(f"[agent] Workspace discovery failed: {e}", err=True)

    if not config.watched_folders:
        click.echo("ERROR: No watched folders configured.", err=True)
        sys.exit(1)

    click.echo("Starting Forecasto Agent v0.1.0")
    click.echo(f"  Server: {config.server.base_url}")
    click.echo(f"  Folders: {len(config.watched_folders)}")
    for f in config.watched_folders:
        click.echo(f"    {f.path}")

    stop_event = threading.Event()
    pending_count = [0]

    # Asyncio loop runs in a background thread so the main thread is free for pystray
    loop = asyncio.new_event_loop()

    def on_processed(count: int) -> None:
        from forecasto_agent.notifications import notify_documents_processed
        from forecasto_agent import tray
        pending_count[0] += count
        tray.update_badge(pending_count[0])
        notify_documents_processed(count)

    queue = DocumentQueue(config=config, on_processed=on_processed)
    watcher = FolderWatcher(queue=queue, config=config, loop=loop)

    def _async_worker():
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(queue.run())
        except Exception:
            pass

    def _handle_shutdown(signum, frame):
        logger.info("Shutdown signal received, stopping...")
        stop_event.set()
        loop.call_soon_threadsafe(loop.stop)

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    watcher.start()

    async_thread = threading.Thread(target=_async_worker, daemon=True, name="async-worker")
    async_thread.start()

    from forecasto_agent.notifications import notify_startup
    notify_startup(len(config.watched_folders))
    click.echo("Agent running. Press Ctrl+C to stop.")

    if not no_tray:
        # pystray MUST run on the main thread on macOS
        from forecasto_agent import tray
        inbox_url = f"{config.server.base_url.rstrip('/')}/inbox"
        tray.run_tray_main(inbox_url=inbox_url, stop_event=stop_event)
    else:
        # No tray: just wait for stop_event
        try:
            stop_event.wait()
        except KeyboardInterrupt:
            stop_event.set()

    watcher.stop()
    loop.call_soon_threadsafe(loop.stop)
    async_thread.join(timeout=3)
    loop.close()
    click.echo("Agent stopped.")
