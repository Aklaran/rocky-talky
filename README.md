# 🏔️ Basecamp

Full-stack AI-native template app. Clone, rename, build.

## Stack

- **Backend:** Express + tRPC v11 + Prisma + PostgreSQL + Pino
- **Frontend:** React + Vite + TanStack Router + Tailwind CSS + shadcn/ui
- **Auth:** Self-hosted (argon2 + express-session) *(Phase 2)*
- **AI:** Provider-agnostic LLM service *(Phase 4)*
- **Testing:** Vitest + Playwright
- **Containers:** Docker + Docker Compose

## Quick Start

```bash
# 1. Clone and install
git clone git@github.com:Aklaran/basecamp.git
cd basecamp
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# 3. Start Postgres
docker compose up -d postgres

# 4. Run migrations
pnpm generate
pnpm migrate

# 5. Start dev servers
pnpm dev
```

Backend runs on `http://localhost:3000`, frontend on `http://localhost:5173`.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start backend + frontend with hot reload |
| `pnpm test` | Run Vitest (unit + integration) |
| `pnpm test:e2e` | Run Playwright (browser tests) |
| `pnpm build` | Build backend + frontend for production |
| `pnpm generate` | Generate Prisma client |
| `pnpm migrate` | Run database migrations |
| `pnpm lint` | Lint with ESLint |
| `pnpm typecheck` | TypeScript type checking |

## Architecture

```
Frontend (React + TanStack Router)
    │  tRPC client (type-safe)
    ▼
tRPC Router (routes/) → Zod validation
    │
Service Layer (services/) → business logic
    │
Repository Layer (repositories/) → Prisma queries
    │
PostgreSQL
```

## Project Structure

```
basecamp/
├── app/
│   ├── backend/     # Express + tRPC + Prisma
│   ├── frontend/    # React + Vite + TanStack Router
│   └── shared/      # Types, schemas, utilities
├── docker/          # Dockerfile + nginx.conf
├── tests/
│   ├── unit/        # Vitest unit tests
│   ├── integration/ # Vitest integration tests
│   └── e2e/         # Playwright browser tests
├── bin/             # Dev scripts
└── docker-compose.yml
```
