#!/bin/bash
set -e

# Start all dev services with concurrently
# Postgres runs via docker compose; backend + frontend run locally for hot reload
echo "🏔️  Starting Basecamp dev environment..."

# Ensure postgres is running
docker compose up -d postgres

# Wait for postgres
echo "Waiting for postgres..."
until docker compose exec postgres pg_isready -U basecamp -d basecamp > /dev/null 2>&1; do
  sleep 1
done
echo "Postgres ready."

# Run migrations
cd app/backend && pnpm migrate 2>/dev/null || echo "No migrations to run yet." && cd ../..

# Start backend + frontend
npx concurrently \
  -n BACKEND,FRONTEND \
  -c magenta,cyan \
  "pnpm dev:backend" \
  "pnpm dev:frontend"
