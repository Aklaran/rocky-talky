#!/bin/bash
# Stop all Basecamp processes

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "Stopping Basecamp..."

# Kill any bare processes on dev/prod ports
kill $(lsof -ti:3000) 2>/dev/null && echo "✓ Killed port 3000" || echo "  Port 3000 not in use"
kill $(lsof -ti:5173) 2>/dev/null && echo "✓ Killed port 5173" || echo "  Port 5173 not in use"

# Stop docker containers
if docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --quiet 2>/dev/null | grep -q .; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml down
  echo "✓ Docker containers stopped"
else
  echo "  No Docker containers running"
fi

echo "Done."
