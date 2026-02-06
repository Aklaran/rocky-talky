#!/bin/bash
set -e

echo "🏔️  Starting Basecamp dev environment..."

# Check if postgres is reachable
if node -e "const net=require('net');const s=net.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
  echo "Postgres ready."
else
  echo "Starting postgres..."
  docker compose up -d postgres

  echo "Waiting for postgres..."
  until node -e "const net=require('net');const s=net.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; do
    sleep 1
  done
  echo "Postgres ready."
fi

# Run migrations (if any exist)
(cd app/backend && npx prisma migrate deploy 2>/dev/null) || echo "No migrations to run yet."

# Start backend + frontend
npx concurrently \
  -n BACKEND,FRONTEND \
  -c magenta,cyan \
  "pnpm dev:backend" \
  "pnpm dev:frontend"
