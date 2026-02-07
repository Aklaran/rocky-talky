#!/bin/bash
set -e

# Start Basecamp in production mode over Tailscale — fully dockerized
# Express serves built frontend static files — no nginx needed
# Tailscale Serve provides HTTPS termination → localhost:3000

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Get Tailscale hostname for HTTPS URL
TS_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
TS_HOSTNAME=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "")
echo "🏔️  Basecamp Tailscale Prod (Docker)"
echo "====================================="
echo ""

# Ensure we have a SESSION_SECRET
if [ -z "$SESSION_SECRET" ]; then
  # Try .env file
  if [ -f .env ]; then
    SESSION_SECRET=$(grep -E '^SESSION_SECRET=' .env | cut -d= -f2-)
  fi
  if [ -z "$SESSION_SECRET" ]; then
    echo "⚠️  No SESSION_SECRET set. Generating a random one..."
    SESSION_SECRET=$(openssl rand -hex 32)
  fi
fi
export SESSION_SECRET

# Ensure we have a POSTGRES_PASSWORD
if [ -z "$POSTGRES_PASSWORD" ]; then
  if [ -f .env ]; then
    POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
  fi
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-basecamp_dev}"
fi
export POSTGRES_PASSWORD

echo "Building and starting all services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo ""
echo "Waiting for backend to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/trpc/health.check > /dev/null 2>&1; then
    echo "✓ Backend healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "✗ Backend failed to start — check logs:"
    echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend"
    exit 1
  fi
  sleep 1
done

# Ensure Tailscale Serve is proxying HTTPS → localhost:3000
if ! tailscale serve status 2>/dev/null | grep -q "proxy http://127.0.0.1:3000"; then
  echo "Setting up Tailscale HTTPS proxy..."
  sudo tailscale serve --bg 3000
fi

echo ""
if [ -n "$TS_HOSTNAME" ]; then
  echo "🏔️  Basecamp running at https://${TS_HOSTNAME}"
else
  echo "🏔️  Basecamp running at http://${TS_IP}:3000"
fi
echo ""
echo "Logs:    docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "Stop:    docker compose -f docker-compose.yml -f docker-compose.prod.yml down"
echo "Restart: docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend"
