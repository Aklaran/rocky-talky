#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Rocky Talky — Deploy Script
# =============================================================================
# Builds and deploys Rocky Talky as a systemd user service on the host.
# The Pi SDK agent bridge requires native host access (filesystem, ~/.pi/),
# so this runs directly on the machine, not in Docker.
#
# Usage: ./scripts/deploy.sh
#
# What it does:
#   1. Installs dependencies
#   2. Builds backend (TypeScript) and frontend (Vite)
#   3. Runs database migrations
#   4. Installs/updates systemd user service
#   5. Restarts the service
#   6. Ensures Tailscale serve is configured
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="rocky-talky"
PORT=7200
TAILSCALE_PORT=7200

# --- Environment variables (production) ---
# These are baked into the systemd service file.
# No .env files in production — this script is the source of truth.
DATABASE_URL="postgresql://basecamp:basecamp_dev@localhost:5432/rocky_talky"
SESSION_SECRET="809e1235c0b0d97dc53dfcfb46b5e1f0ea49169bfb58c24bad3e6c0cc8253ad4"
NODE_ENV="production"
COOKIE_SECURE="true"
TRUST_PROXY="1"
LOG_LEVEL="info"

echo "🏔️  Deploying Rocky Talky..."
echo "   Repo: $REPO_DIR"
echo "   Port: $PORT"

# --- Step 1: Install dependencies ---
echo ""
echo "📦 Installing dependencies..."
cd "$REPO_DIR"
pnpm install --frozen-lockfile

# --- Step 2: Build ---
echo ""
echo "🔨 Building..."
cd "$REPO_DIR/app/backend"
pnpm generate  # Prisma client
cd "$REPO_DIR"
pnpm build     # TypeScript + Vite

# --- Step 3: Database migrations ---
echo ""
echo "🗃️  Running database migrations..."
cd "$REPO_DIR/app/backend"
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

# --- Step 4: Install systemd service ---
echo ""
echo "⚙️  Installing systemd service..."
mkdir -p "$HOME/.config/systemd/user"

cat > "$HOME/.config/systemd/user/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Rocky Talky — Mobile Chat for Annapurna
After=network.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
ExecStart=$(which node) app/backend/dist/backend/src/server.js
Restart=on-failure
RestartSec=5

# Environment
Environment=NODE_ENV=${NODE_ENV}
Environment=PORT=${PORT}
Environment=DATABASE_URL=${DATABASE_URL}
Environment=SESSION_SECRET=${SESSION_SECRET}
Environment=COOKIE_SECURE=${COOKIE_SECURE}
Environment=TRUST_PROXY=${TRUST_PROXY}
Environment=LOG_LEVEL=${LOG_LEVEL}

# Logging handled by journald
StandardOutput=append:/tmp/rocky-talky.log
StandardError=append:/tmp/rocky-talky.log
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=default.target
EOF

# --- Step 5: Restart service ---
echo ""
echo "🔄 Restarting service..."
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user restart "$SERVICE_NAME"

# Wait a moment and check status
sleep 2
if systemctl --user is-active --quiet "$SERVICE_NAME"; then
    echo "✅ ${SERVICE_NAME} is running on port ${PORT}"
else
    echo "❌ ${SERVICE_NAME} failed to start. Check logs:"
    echo "   journalctl --user -u ${SERVICE_NAME} -n 20"
    exit 1
fi

# --- Step 6: Tailscale serve ---
echo ""
echo "🌐 Configuring Tailscale serve..."
sudo tailscale serve --bg --https="$TAILSCALE_PORT" "http://127.0.0.1:${PORT}"
echo "✅ Tailscale: https://annapurna.tail63068d.ts.net:${TAILSCALE_PORT}/"

echo ""
echo "🏔️  Rocky Talky deployed successfully!"
echo ""
echo "   Local:     http://127.0.0.1:${PORT}"
echo "   Tailscale: https://annapurna.tail63068d.ts.net:${TAILSCALE_PORT}/"
echo "   Logs:      journalctl --user -u ${SERVICE_NAME} -f"
echo "   Status:    systemctl --user status ${SERVICE_NAME}"
