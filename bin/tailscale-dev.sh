#!/bin/bash
set -e

# Start Basecamp dev environment accessible over Tailscale
# Backend: http://<tailscale-ip>:3000
# Frontend: http://<tailscale-ip>:5173 (Vite HMR + proxy to backend)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Get Tailscale IP
TS_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
echo "🏔️  Basecamp Tailscale Dev"
echo "========================="

# Ensure postgres is running
echo "Starting postgres..."
cd "$PROJECT_DIR"
sg docker -c "docker compose up -d postgres"
until sg docker -c "docker compose exec postgres pg_isready -U basecamp -d basecamp" > /dev/null 2>&1; do
  sleep 1
done
echo "✓ Postgres ready"

# Kill any existing processes on our ports
kill $(lsof -ti:3000) 2>/dev/null || true
kill $(lsof -ti:5173) 2>/dev/null || true
sleep 1

# Start backend
cd "$PROJECT_DIR/app/backend"
nohup npx tsx -r tsconfig-paths/register src/server.ts > /tmp/basecamp-backend.log 2>&1 &
disown
BACKEND_PID=$!
echo "✓ Backend starting (PID: $BACKEND_PID)"

# Start frontend on all interfaces
cd "$PROJECT_DIR/app/frontend"
nohup npx vite --host 0.0.0.0 > /tmp/basecamp-frontend.log 2>&1 &
disown
FRONTEND_PID=$!
echo "✓ Frontend starting (PID: $FRONTEND_PID)"

# Wait and verify
sleep 3
if curl -sf http://localhost:3000/api/trpc/health.check > /dev/null 2>&1; then
  echo "✓ Backend healthy"
else
  echo "✗ Backend failed — check /tmp/basecamp-backend.log"
fi

echo ""
echo "Frontend: http://${TS_IP}:5173"
echo "Backend:  http://${TS_IP}:3000"
echo ""
echo "Logs:"
echo "  tail -f /tmp/basecamp-backend.log"
echo "  tail -f /tmp/basecamp-frontend.log"
echo ""
echo "Stop: kill $BACKEND_PID $FRONTEND_PID"
