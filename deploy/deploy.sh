#!/bin/bash
set -euo pipefail

# Forecasto Deploy Script
# Run from local Mac: ./deploy/deploy.sh

SERVER="root@82.165.216.239"
REMOTE_BASE="/var/www/vhosts/app.forecasto.it"
REMOTE_APP="$REMOTE_BASE/app"
REMOTE_HTDOCS="$REMOTE_BASE/httpdocs"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Forecasto Deploy ==="
echo "Local: $LOCAL_DIR"
echo "Remote: $SERVER:$REMOTE_APP"
echo ""

# --- Step 1: Build frontend locally ---
echo ">>> Step 1: Building frontend..."
cd "$LOCAL_DIR/forecasto-client-web"
VITE_API_URL=/api/v1 npx vite build
echo "Frontend built successfully."
echo ""

# --- Step 1b: Build MCP server locally ---
echo ">>> Step 1b: Building MCP server..."
cd "$LOCAL_DIR/forecasto-mcp"
npm install --silent
npm run build
echo "MCP server built successfully."
echo ""

# --- Step 2: Rsync code to server ---
echo ">>> Step 2: Syncing code to server..."
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
    "$LOCAL_DIR/" "$SERVER:$REMOTE_APP/"
echo "Code synced."
echo ""

# --- Step 2b: Sync MCP dist (built locally, not on server) ---
echo ">>> Step 2b: Syncing MCP dist..."
rsync -avz --delete \
    "$LOCAL_DIR/forecasto-mcp/dist/" "$SERVER:$REMOTE_APP/forecasto-mcp/dist/"
echo "MCP dist synced."
echo ""

# --- Step 3: Sync frontend build to httpdocs ---
echo ">>> Step 3: Syncing frontend build..."
rsync -avz --delete \
    --exclude '.htaccess' \
    "$LOCAL_DIR/forecasto-client-web/dist/" "$SERVER:$REMOTE_HTDOCS/"
echo "Frontend deployed to httpdocs."
echo ""

# --- Step 3b: Deploy .htaccess ---
echo ">>> Step 3b: Deploying .htaccess..."
scp "$LOCAL_DIR/deploy/htaccess" "$SERVER:$REMOTE_HTDOCS/.htaccess"
ssh "$SERVER" "chown forecasto:psacln $REMOTE_HTDOCS/.htaccess"
echo ".htaccess deployed."
echo ""

# --- Step 4: Remote setup ---
echo ">>> Step 4: Remote setup..."
ssh "$SERVER" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail

APP_DIR="/var/www/vhosts/app.forecasto.it/app"
SERVER_DIR="$APP_DIR/forecasto-server"
MCP_DIR="$APP_DIR/forecasto-mcp"

# ---- FastAPI ----

# Create venv if not exists
if [ ! -d "$SERVER_DIR/.venv" ]; then
    echo "Creating Python venv..."
    python3 -m venv "$SERVER_DIR/.venv"
fi

# Install/update dependencies
echo "Installing Python dependencies..."
cd "$SERVER_DIR"
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -e . -q

# Run Alembic migrations
echo "Running database migrations..."
.venv/bin/python -m alembic upgrade head

# Copy production .env if not exists
if [ ! -f "$SERVER_DIR/.env" ]; then
    echo "Creating .env from template..."
    cp "$APP_DIR/deploy/env.production" "$SERVER_DIR/.env"
    # Generate a random secret key
    SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
    sed -i "s|CHANGE_ME_TO_A_SECURE_RANDOM_KEY|$SECRET|" "$SERVER_DIR/.env"
    echo ">>> .env created with random SECRET_KEY"
fi

# Install systemd service
echo "Installing FastAPI systemd service..."
cp "$APP_DIR/deploy/forecasto.service" /etc/systemd/system/forecasto.service
systemctl daemon-reload
systemctl enable forecasto

# Restart the FastAPI service
echo "Restarting forecasto service..."
systemctl restart forecasto
sleep 2
systemctl status forecasto --no-pager || true

# ---- MCP Server ----

# Install Node dependencies on server (production only)
echo "Installing MCP Node dependencies..."
cd "$MCP_DIR"
npm install --production --silent

# Copy MCP .env if not exists
if [ ! -f "$MCP_DIR/.env" ]; then
    echo "Creating MCP .env from template..."
    cp "$APP_DIR/deploy/env.mcp.production" "$MCP_DIR/.env"
    echo ">>> MCP .env created — review /opt settings if needed"
fi

# Install systemd service
echo "Installing MCP systemd service..."
cp "$APP_DIR/forecasto-mcp/deploy/mcp.service" /etc/systemd/system/forecasto-mcp.service

# Update WorkingDirectory in service to actual path (not /opt)
sed -i "s|WorkingDirectory=/opt/forecasto-mcp|WorkingDirectory=$MCP_DIR|" /etc/systemd/system/forecasto-mcp.service
sed -i "s|ExecStart=/usr/bin/node dist/index.js|ExecStart=/usr/bin/node $MCP_DIR/dist/index.js|" /etc/systemd/system/forecasto-mcp.service
sed -i "s|EnvironmentFile=/opt/forecasto-mcp/.env|EnvironmentFile=$MCP_DIR/.env|" /etc/systemd/system/forecasto-mcp.service

systemctl daemon-reload
systemctl enable forecasto-mcp

# Restart MCP service
echo "Restarting forecasto-mcp service..."
systemctl restart forecasto-mcp
sleep 2
systemctl status forecasto-mcp --no-pager || true

echo ""
echo "=== Deploy complete! ==="
echo "Check FastAPI: curl -s http://127.0.0.1:8000/health"
echo "Check MCP:     curl -s http://127.0.0.1:3100/health"
REMOTE_SCRIPT

echo ""
echo "=== Deploy finished! ==="
echo ""
echo "Verify: https://app.forecasto.it"
echo "MCP:    https://app.forecasto.it/mcp"
echo ""
echo "Transfer database (first time only):"
echo "  scp forecasto-server/forecasto.db $SERVER:$REMOTE_APP/forecasto-server/forecasto.db"
