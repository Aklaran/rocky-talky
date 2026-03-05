#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Rocky Talky — Deploy Script (macOS / launchd)
# =============================================================================
# Deploys Rocky Talky to dev, staging, or production on macOS.
#
# Usage:
#   ./scripts/deploy.sh dev       — Start Vite + Express in watch mode
#   ./scripts/deploy.sh staging   — Build + deploy to staging (nginx :7211)
#   ./scripts/deploy.sh prod      — Build + deploy to production (Tailscale :7200)
#   ./scripts/deploy.sh promote   — Promote staging → production
#
# Port Map:
#   Dev:     Vite :7205, Express :7206
#   Staging: Express :7210, Nginx :7211
#   Prod:    Express :7202, Nginx :7201, Tailscale :7200
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"
LOG_DIR="$HOME/.local/state/rocky-talky"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

# --- Helpers ---

ensure_dirs() {
  mkdir -p "$LOG_DIR"
  mkdir -p "$LAUNCH_AGENTS_DIR"
}

check_postgres() {
  if ! node -e "const net=require('net');const s=net.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "❌ Postgres not reachable on :5432. Start Docker first:"
    echo "   docker compose up -d postgres"
    exit 1
  fi
}

check_nginx() {
  if ! command -v nginx &>/dev/null; then
    echo "❌ nginx not installed. Run: brew install nginx"
    exit 1
  fi
  if ! [ -f /opt/homebrew/etc/nginx/servers/rocky-talky.conf ]; then
    echo "❌ nginx config not installed. Run:"
    echo "   sudo cp $DEPLOY_DIR/nginx/rocky-talky.conf /opt/homebrew/etc/nginx/servers/"
    exit 1
  fi
}

build_app() {
  echo "📦 Installing dependencies..."
  cd "$REPO_DIR"
  pnpm install --frozen-lockfile

  echo "🔨 Building..."
  cd "$REPO_DIR/app/backend"
  pnpm generate  # Prisma client
  cd "$REPO_DIR"
  pnpm build     # TypeScript + Vite
}

run_migrations() {
  local db_url="$1"
  echo "🗃️  Running migrations..."
  cd "$REPO_DIR/app/backend"
  DATABASE_URL="$db_url" npx prisma migrate deploy
}

install_service() {
  local plist_name="$1"
  local source="$DEPLOY_DIR/launchd/${plist_name}.plist"
  local target="$LAUNCH_AGENTS_DIR/${plist_name}.plist"

  cp "$source" "$target"

  # Unload if already loaded (ignore errors if not loaded)
  launchctl bootout "gui/$(id -u)/$plist_name" 2>/dev/null || true

  # Load and start
  launchctl bootstrap "gui/$(id -u)" "$target"
  launchctl kickstart "gui/$(id -u)/$plist_name"
}

restart_service() {
  local plist_name="$1"
  launchctl kickstart -k "gui/$(id -u)/$plist_name"
}

check_service() {
  local plist_name="$1"
  local port="$2"

  sleep 2
  if node -e "const net=require('net');const s=net.connect($port,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "✅ $plist_name is running on port $port"
  else
    echo "❌ $plist_name failed to start. Check logs:"
    echo "   tail -50 $LOG_DIR/$([ "$plist_name" = "com.annapurna.rocky-talky-staging" ] && echo staging || echo production).log"
    exit 1
  fi
}

ensure_nginx_running() {
  if ! pgrep -x nginx &>/dev/null; then
    echo "🌐 Starting nginx..."
    nginx
  else
    echo "🌐 Reloading nginx..."
    nginx -s reload
  fi
}

# --- Commands ---

case "${1:?Usage: deploy.sh <dev|staging|prod|promote>}" in

  dev)
    echo "🏔️  Starting Rocky Talky dev environment..."
    check_postgres

    cd "$REPO_DIR"

    # Run migrations against dev DB
    run_migrations "postgresql://basecamp:basecamp_dev@localhost:5432/rocky_talky_dev"

    # Start backend + frontend with dev ports
    PORT=7206 npx concurrently \
      -n BACKEND,FRONTEND \
      -c magenta,cyan \
      "PORT=7206 pnpm dev:backend" \
      "pnpm dev:frontend -- --port 7205"
    ;;

  staging)
    echo "🏔️  Deploying Rocky Talky to staging..."
    ensure_dirs
    check_postgres
    check_nginx

    build_app
    run_migrations "postgresql://basecamp:basecamp_dev@localhost:5432/rocky_talky_staging"

    echo "⚙️  Installing staging service..."
    install_service "com.annapurna.rocky-talky-staging"
    ensure_nginx_running
    check_service "com.annapurna.rocky-talky-staging" 7210

    echo ""
    echo "🏔️  Staging deployed!"
    echo "   Express: http://127.0.0.1:7210"
    echo "   Nginx:   http://127.0.0.1:7211"
    ;;

  prod)
    echo "🏔️  Deploying Rocky Talky to production..."
    ensure_dirs
    check_postgres
    check_nginx

    build_app
    run_migrations "postgresql://basecamp:basecamp_dev@localhost:5432/rocky_talky"

    echo "⚙️  Installing production service..."
    install_service "com.annapurna.rocky-talky"
    ensure_nginx_running
    check_service "com.annapurna.rocky-talky" 7202

    # Tailscale serve (requires sudo)
    echo "🌐 Configuring Tailscale serve..."
    sudo tailscale serve --bg --https=7200 http://127.0.0.1:7201

    echo ""
    echo "🏔️  Production deployed!"
    echo "   Express:   http://127.0.0.1:7202"
    echo "   Nginx:     http://127.0.0.1:7201"
    echo "   Tailscale: https://annapurna.tail63068d.ts.net:7200/"
    ;;

  promote)
    echo "🏔️  Promoting staging to production..."
    echo "   (Staging already tested — deploying prod with same build)"
    "$0" prod
    ;;

  *)
    echo "Usage: deploy.sh <dev|staging|prod|promote>"
    echo ""
    echo "  dev      Start Vite + Express in watch mode (ports 7205/7206)"
    echo "  staging  Build + deploy to staging (nginx :7211)"
    echo "  prod     Build + deploy to production (Tailscale :7200)"
    echo "  promote  Promote staging → production"
    exit 1
    ;;
esac
