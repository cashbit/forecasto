#!/bin/bash
set -euo pipefail

# Forecasto Deploy Script
# Run from local Mac: ./deploy/deploy.sh [--client] [--server] [--mcp]
#
# With no flags: deploys everything (client + server + mcp)
# With flags:    deploys only the specified components
#   --client   build & sync frontend to httpdocs (no service restarts)
#   --server   sync & restart FastAPI backend
#   --mcp      build & sync & restart MCP server

SERVER="root@82.165.216.239"
REMOTE_BASE="/var/www/vhosts/app.forecasto.it"
REMOTE_APP="$REMOTE_BASE/app"
REMOTE_HTDOCS="$REMOTE_BASE/httpdocs"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Parse flags ---
DEPLOY_CLIENT=false
DEPLOY_SERVER=false
DEPLOY_MCP=false

if [ $# -eq 0 ]; then
  DEPLOY_CLIENT=true
  DEPLOY_SERVER=true
  DEPLOY_MCP=true
else
  for arg in "$@"; do
    case "$arg" in
      --client) DEPLOY_CLIENT=true ;;
      --server) DEPLOY_SERVER=true ;;
      --mcp)    DEPLOY_MCP=true ;;
      *) echo "Unknown flag: $arg. Use --client, --server, --mcp"; exit 1 ;;
    esac
  done
fi

echo "=== Forecasto Deploy ==="
echo "Local:  $LOCAL_DIR"
echo "Remote: $SERVER:$REMOTE_APP"
echo "Components: $([ "$DEPLOY_CLIENT" = true ] && echo "client ") $([ "$DEPLOY_SERVER" = true ] && echo "server ") $([ "$DEPLOY_MCP" = true ] && echo "mcp")"
echo ""

# ============================================================
# CLIENT
# ============================================================
if [ "$DEPLOY_CLIENT" = true ]; then
  echo ">>> Building frontend..."
  cd "$LOCAL_DIR/forecasto-client-web"
  VITE_API_URL=/api/v1 npx vite build
  echo "Frontend built."
  echo ""

  echo ">>> Syncing frontend build to httpdocs..."
  rsync -avz --delete --chmod=Du=rwx,Dg=rx,Do=rx,Fu=rw,Fg=r,Fo=r \
      --exclude '.htaccess' \
      "$LOCAL_DIR/forecasto-client-web/dist/" "$SERVER:$REMOTE_HTDOCS/"
  echo "Frontend deployed."
  echo ""

  echo ">>> Deploying .htaccess..."
  scp "$LOCAL_DIR/deploy/htaccess" "$SERVER:$REMOTE_HTDOCS/.htaccess"
  ssh "$SERVER" "chown forecasto:psacln $REMOTE_HTDOCS/.htaccess"
  echo ".htaccess deployed."
  echo ""

  echo ">>> Fixing httpdocs permissions (nginx requires o+r)..."
  ssh "$SERVER" "find $REMOTE_HTDOCS -type d -exec chmod 755 {} + && find $REMOTE_HTDOCS -type f -exec chmod 644 {} + && chmod 600 $REMOTE_HTDOCS/.htaccess"
  echo "Permissions fixed."
  echo ""
fi

# ============================================================
# SERVER (FastAPI)
# ============================================================
if [ "$DEPLOY_SERVER" = true ]; then
  echo ">>> Syncing server code..."
  rsync -avz --delete \
      --exclude 'node_modules' \
      --exclude '.venv' \
      --exclude '__pycache__' \
      --exclude '.git' \
      --exclude '*.pyc' \
      --exclude 'forecasto.db' \
      --exclude '.env' \
      --exclude 'dist' \
      --exclude 'sessioni' \
      --exclude 'assets' \
      --exclude 'docs' \
      --exclude '*.md' \
      --exclude 'test_*.py' \
      --exclude 'Pending' \
      --filter="- forecasto-client-web/" \
      --filter="- forecasto-mcp/" \
      "$LOCAL_DIR/forecasto-server/" "$SERVER:$REMOTE_APP/forecasto-server/"
  # Also sync deploy/ folder (service files, env templates)
  rsync -avz \
      "$LOCAL_DIR/deploy/" "$SERVER:$REMOTE_APP/deploy/"
  echo "Server code synced."
  echo ""

  echo ">>> Remote: install deps, migrate, restart FastAPI..."
  ssh "$SERVER" bash -s <<'REMOTE_SERVER'
set -euo pipefail
APP_DIR="/var/www/vhosts/app.forecasto.it/app"
SERVER_DIR="$APP_DIR/forecasto-server"

if [ ! -d "$SERVER_DIR/.venv" ]; then
    echo "Creating Python venv..."
    python3 -m venv "$SERVER_DIR/.venv"
fi

cd "$SERVER_DIR"
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -e . -q

echo "Running database migrations..."
.venv/bin/python -m alembic upgrade head

if [ ! -f "$SERVER_DIR/.env" ]; then
    echo "Creating .env from template..."
    cp "$APP_DIR/deploy/env.production" "$SERVER_DIR/.env"
    SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
    sed -i "s|CHANGE_ME_TO_A_SECURE_RANDOM_KEY|$SECRET|" "$SERVER_DIR/.env"
fi

cp "$APP_DIR/deploy/forecasto.service" /etc/systemd/system/forecasto.service
systemctl daemon-reload
systemctl enable forecasto
systemctl restart forecasto

echo "Waiting for FastAPI health check..."
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8000/health | grep -q '"status"'; then
    echo "FastAPI healthy after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "WARNING: FastAPI did not become healthy within 15s!"
systemctl status forecasto --no-pager || true
REMOTE_SERVER
  echo ""
fi

# ============================================================
# MCP
# ============================================================
if [ "$DEPLOY_MCP" = true ]; then
  echo ">>> Building MCP server..."
  cd "$LOCAL_DIR/forecasto-mcp"
  npm install --silent
  npm run build
  echo "MCP built."
  echo ""

  echo ">>> Syncing MCP dist..."
  rsync -avz --delete \
      "$LOCAL_DIR/forecasto-mcp/dist/" "$SERVER:$REMOTE_APP/forecasto-mcp/dist/"
  # Also sync package.json and deploy/ subfolder
  rsync -avz \
      "$LOCAL_DIR/forecasto-mcp/package.json" \
      "$LOCAL_DIR/forecasto-mcp/package-lock.json" \
      "$SERVER:$REMOTE_APP/forecasto-mcp/"
  rsync -avz \
      "$LOCAL_DIR/forecasto-mcp/deploy/" "$SERVER:$REMOTE_APP/forecasto-mcp/deploy/"
  echo "MCP dist synced."
  echo ""

  echo ">>> Remote: install deps, restart MCP..."
  ssh "$SERVER" bash -s <<'REMOTE_MCP'
set -euo pipefail
APP_DIR="/var/www/vhosts/app.forecasto.it/app"
MCP_DIR="$APP_DIR/forecasto-mcp"

cd "$MCP_DIR"
npm install --production --silent

if [ ! -f "$MCP_DIR/.env" ]; then
    echo "Creating MCP .env from template..."
    cp "$APP_DIR/deploy/env.mcp.production" "$MCP_DIR/.env"
fi

cp "$MCP_DIR/deploy/mcp.service" /etc/systemd/system/forecasto-mcp.service
sed -i "s|WorkingDirectory=/opt/forecasto-mcp|WorkingDirectory=$MCP_DIR|" /etc/systemd/system/forecasto-mcp.service
sed -i "s|ExecStart=/usr/bin/node dist/index.js|ExecStart=/usr/bin/node $MCP_DIR/dist/index.js|" /etc/systemd/system/forecasto-mcp.service
sed -i "s|EnvironmentFile=/opt/forecasto-mcp/.env|EnvironmentFile=$MCP_DIR/.env|" /etc/systemd/system/forecasto-mcp.service

systemctl daemon-reload
systemctl enable forecasto-mcp
systemctl restart forecasto-mcp

echo "Waiting for MCP health check..."
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3100/health | grep -q '"status":"ok"'; then
    echo "MCP healthy after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "WARNING: MCP did not become healthy within 15s!"
systemctl status forecasto-mcp --no-pager || true
REMOTE_MCP
  echo ""
fi

# ============================================================
echo "=== Deploy finished! ==="
echo ""
echo "Verify: https://app.forecasto.it"
[ "$DEPLOY_MCP" = true ] && echo "MCP:    https://app.forecasto.it/mcp"
echo ""
echo "Transfer database (first time only):"
echo "  scp forecasto-server/forecasto.db $SERVER:$REMOTE_APP/forecasto-server/forecasto.db"
