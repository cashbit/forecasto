#!/bin/bash
# ─────────────────────────────────────────────────────────
# Forecasto — Local Development Launcher
# Usage: ./dev.sh [--prod-db] [--stop]
# ─────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT/forecasto-server"
CLIENT_DIR="$ROOT/forecasto-client-web"
SERVER_LOG="/tmp/forecasto-server.log"
CLIENT_LOG="/tmp/forecasto-client.log"
PID_SERVER="/tmp/forecasto-server.pid"
PID_CLIENT="/tmp/forecasto-client.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Functions ─────────────────────────────────────────────

stop_all() {
  echo -e "${YELLOW}Stopping services...${NC}"
  # Kill by PID files
  for pidfile in "$PID_SERVER" "$PID_CLIENT"; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo "  Killed PID $pid"
      fi
      rm -f "$pidfile"
    fi
  done
  # Also kill by port (safety net)
  lsof -ti :8000 | xargs kill -9 2>/dev/null || true
  lsof -ti :3000 | xargs kill -9 2>/dev/null || true
  sleep 1
  echo -e "${GREEN}All services stopped.${NC}"
}

download_prod_db() {
  echo -e "${YELLOW}Downloading production database...${NC}"
  local SERVER="root@82.165.216.239"
  local REMOTE_DB="/var/www/vhosts/app.forecasto.it/app/forecasto-server/forecasto.db"
  local LOCAL_DB="$SERVER_DIR/forecasto.db"
  local BACKUP="$SERVER_DIR/forecasto-local-backup-$(date +%Y%m%d-%H%M%S).db"

  # Backup existing local DB
  if [ -f "$LOCAL_DB" ]; then
    cp "$LOCAL_DB" "$BACKUP"
    echo "  Local DB backed up to $(basename "$BACKUP")"
  fi

  scp "$SERVER:$REMOTE_DB" "$LOCAL_DB"
  echo -e "${GREEN}Production DB downloaded ($(du -h "$LOCAL_DB" | cut -f1))${NC}"
}

run_migrations() {
  echo -e "${YELLOW}Running Alembic migrations...${NC}"
  cd "$SERVER_DIR"
  .venv/bin/python -m alembic upgrade head
  echo -e "${GREEN}Migrations applied.${NC}"
}

start_server() {
  cd "$SERVER_DIR"

  # Load env vars from .env (so ANTHROPIC_API_KEY etc. are available)
  set -a
  source .env
  set +a

  echo -e "${YELLOW}Starting FastAPI server on :8000...${NC}"
  .venv/bin/python -m uvicorn forecasto.main:app \
    --host 0.0.0.0 --port 8000 --reload \
    >> "$SERVER_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_SERVER"

  # Wait for server to be ready
  for i in $(seq 1 15); do
    if curl -s -o /dev/null -w '' http://localhost:8000/docs 2>/dev/null; then
      echo -e "${GREEN}  Server ready (PID $pid)${NC}"
      return 0
    fi
    sleep 1
  done
  echo -e "${RED}  Server failed to start! Check $SERVER_LOG${NC}"
  return 1
}

start_client() {
  cd "$CLIENT_DIR"

  echo -e "${YELLOW}Starting Vite client on :3000...${NC}"
  npm run dev >> "$CLIENT_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_CLIENT"

  # Wait for client to be ready
  for i in $(seq 1 15); do
    if curl -s -o /dev/null -w '' http://localhost:3000 2>/dev/null; then
      echo -e "${GREEN}  Client ready (PID $pid)${NC}"
      return 0
    fi
    sleep 1
  done
  echo -e "${RED}  Client failed to start! Check $CLIENT_LOG${NC}"
  return 1
}

# ── Main ──────────────────────────────────────────────────

# Handle --stop
if [ "${1:-}" = "--stop" ]; then
  stop_all
  exit 0
fi

echo "═══════════════════════════════════════════"
echo "  Forecasto Local Development"
echo "═══════════════════════════════════════════"

# Stop any existing instances
stop_all

# Download prod DB if requested
if [ "${1:-}" = "--prod-db" ]; then
  download_prod_db
fi

# Run migrations
run_migrations

# Clear old logs
> "$SERVER_LOG"
> "$CLIENT_LOG"

# Start services
start_server
start_client

echo ""
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}All services running!${NC}"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "  Logs:"
echo "    Server: tail -f $SERVER_LOG"
echo "    Client: tail -f $CLIENT_LOG"
echo ""
echo "  Stop: ./dev.sh --stop"
echo "═══════════════════════════════════════════"
