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
echo "Installing systemd service..."
cp "$APP_DIR/deploy/forecasto.service" /etc/systemd/system/forecasto.service
systemctl daemon-reload
systemctl enable forecasto

# Restart the service
echo "Restarting forecasto service..."
systemctl restart forecasto
sleep 2
systemctl status forecasto --no-pager || true

echo ""
echo "=== Deploy complete! ==="
echo "Check: curl -s http://127.0.0.1:8000/health"
REMOTE_SCRIPT

echo ""
echo "=== Deploy finished! ==="
echo ""
echo "Verify: https://app.forecasto.it"
echo ""
echo "Transfer database (first time only):"
echo "  scp forecasto-server/forecasto.db $SERVER:$REMOTE_APP/forecasto-server/forecasto.db"
