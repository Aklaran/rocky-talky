#!/bin/bash
set -e

# Start Basecamp in production mode over Tailscale
# Express serves built frontend static files — no nginx needed
# http://<tailscale-ip>:3000

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Get Tailscale IP
TS_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
echo "🏔️  Basecamp Tailscale Prod"
echo "=========================="

# Ensure postgres is running
echo "Starting postgres..."
cd "$PROJECT_DIR"
sg docker -c "docker compose up -d postgres"
until sg docker -c "docker compose exec postgres pg_isready -U basecamp -d basecamp" > /dev/null 2>&1; do
  sleep 1
done
echo "✓ Postgres ready"

# Build frontend
echo "Building frontend..."
cd "$PROJECT_DIR/app/frontend"
npx vite build
echo "✓ Frontend built"

# Build backend
echo "Building backend..."
cd "$PROJECT_DIR/app/backend"
rm -rf dist
pnpm build
echo "✓ Backend built"

# Run migrations
echo "Running migrations..."
npx prisma migrate deploy 2>/dev/null || echo "  (no migrations to run)"
echo "✓ Migrations done"

# Kill any existing process on port 3000
kill $(lsof -ti:3000) 2>/dev/null || true
sleep 1

# Start production server
# tsc-alias rewrites path aliases to relative paths, so no tsconfig-paths needed
cd "$PROJECT_DIR"
NODE_ENV=production nohup node \
  app/backend/dist/backend/src/server.js > /tmp/basecamp-prod.log 2>&1 &
disown
PROD_PID=$!

sleep 2
if curl -sf http://localhost:3000/api/trpc/health.check > /dev/null 2>&1; then
  echo "✓ Server healthy"
else
  echo "✗ Server failed — check /tmp/basecamp-prod.log"
fi

echo ""
echo "🏔️  Basecamp running at http://${TS_IP}:3000"
echo ""
echo "Logs: tail -f /tmp/basecamp-prod.log"
echo "Stop: kill $PROD_PID"
