#!/bin/bash
# Stop all Basecamp processes

echo "Stopping Basecamp..."
kill $(lsof -ti:3000) 2>/dev/null && echo "✓ Killed port 3000" || echo "  Port 3000 not in use"
kill $(lsof -ti:5173) 2>/dev/null && echo "✓ Killed port 5173" || echo "  Port 5173 not in use"
echo "Done. (Postgres still running — use 'docker compose down' to stop it)"
