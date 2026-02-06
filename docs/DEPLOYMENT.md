# Deployment

Basecamp supports three deployment scenarios, all using Docker.

## Scenario A: Mac Mini / Tailscale (Primary)

Multiple apps on one machine, accessed over Tailscale. No SSL needed — Tailscale encrypts everything.

```bash
# 1. Clone and configure
git clone git@github.com:Aklaran/basecamp.git
cd basecamp
cp .env.example .env
# Edit .env: set SESSION_SECRET, AI keys, etc.

# 2. Deploy
bin/tailscale-prod.sh
```

Access at `http://<tailscale-ip>:3000`.

**Multiple apps:** Each app runs on a different port. Set `PORT=3001`, `PORT=3002`, etc. in each app's `.env`.

**Shared Postgres (optional):** Instead of one Postgres per app, run a shared instance:

```bash
# Create a shared postgres
docker run -d --name shared-postgres \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  postgres:16-alpine

# Create a database for each app
docker exec shared-postgres psql -U postgres -c "CREATE DATABASE myapp1;"
docker exec shared-postgres psql -U postgres -c "CREATE DATABASE myapp2;"

# Point each app's DATABASE_URL to the shared instance
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/myapp1
```

### Key settings for Tailscale

```env
COOKIE_SECURE=false   # No HTTPS needed over Tailscale
NODE_ENV=production
```

## Scenario B: Internet-Facing VPS

Single app with SSL termination via nginx.

```bash
# 1. Build and push
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 2. On the server
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 3. Uncomment the nginx service in docker-compose.prod.yml
# 4. Configure SSL (Let's Encrypt) in docker/nginx.conf
```

### Key settings for VPS

```env
COOKIE_SECURE=true    # HTTPS via nginx
NODE_ENV=production
```

## Scenario C: Cloud (Railway, Fly.io, Render)

The same Docker setup works on managed platforms:

1. Connect your GitHub repo
2. Set environment variables in the platform's dashboard
3. Use managed Postgres instead of containerized
4. The Dockerfile builds a self-contained image

### Platform notes

- **Railway:** Auto-detects Dockerfile. Set `PORT` env var.
- **Fly.io:** Use `fly launch`, point to `docker/Dockerfile`.
- **Render:** Add as Docker web service.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | — | At least 32 chars. `openssl rand -hex 32` |
| `NODE_ENV` | — | `development` | `development`, `production`, `test` |
| `PORT` | — | `3000` | Server port |
| `COOKIE_SECURE` | — | `true` in prod | Set `false` for Tailscale |
| `AI_PROVIDER` | — | — | `openai`, `anthropic`, or `mock` |
| `AI_MODEL` | — | `gpt-4o-mini` | Model name for the provider |
| `OPENAI_API_KEY` | — | — | Required if `AI_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | — | — | Required if `AI_PROVIDER=anthropic` |
| `AI_SYSTEM_PROMPT` | — | — | Global system prompt for all conversations |
| `LOG_LEVEL` | — | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

## Docker Commands

```bash
# Development
docker compose up -d postgres          # Just Postgres
pnpm dev                               # Backend + frontend with hot reload

# Production (Tailscale)
bin/tailscale-prod.sh                   # Build + deploy

# Production (VPS)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend

# Stop
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Reset (⚠️ destroys data)
docker compose down -v                  # Removes volumes too
```

## Health Check

```bash
curl http://localhost:3000/api/trpc/health.check
# Returns: { "result": { "data": { "status": "ok", "db": { "latencyMs": 1 } } } }
```
