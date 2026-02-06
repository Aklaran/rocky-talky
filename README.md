# 🏔️ Basecamp

Full-stack AI-native template app. Clone, rename, build.

## Stack

| Layer | Tech |
|-------|------|
| **API** | Express + tRPC v11 (type-safe RPC) |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | Self-hosted (argon2 + express-session) |
| **AI** | Provider-agnostic LLM service (OpenAI, Anthropic, or mock) |
| **Frontend** | React + Vite + TanStack Router |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Testing** | Vitest (unit/integration) + Playwright (E2E) |
| **Containers** | Docker + Docker Compose |

## Quick Start

```bash
# 1. Clone and install
git clone git@github.com:Aklaran/basecamp.git
cd basecamp
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env: set SESSION_SECRET (generate with: openssl rand -hex 32)

# 3. Start Postgres + run migrations
docker compose up -d postgres
pnpm generate
pnpm migrate

# 4. (Optional) Seed demo data
pnpm seed
# Creates demo@basecamp.dev / password123

# 5. Start dev servers
pnpm dev
```

Backend: `http://localhost:3000` · Frontend: `http://localhost:5173`

## AI Configuration

AI is optional — the app works without it (graceful fallback messages).

```env
# .env
AI_PROVIDER=openai          # openai, anthropic, or mock
AI_MODEL=gpt-4o-mini        # Any model the provider supports
OPENAI_API_KEY=sk-...       # Required for openai provider
# ANTHROPIC_API_KEY=sk-ant-... # Required for anthropic provider
# AI_SYSTEM_PROMPT=You are a helpful assistant.
```

To test without API keys, set `AI_PROVIDER=mock`.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start backend + frontend with hot reload |
| `pnpm test` | Run unit + integration tests (Vitest) |
| `pnpm test:e2e` | Run browser tests (Playwright) |
| `pnpm build` | Build backend + frontend for production |
| `pnpm generate` | Generate Prisma client |
| `pnpm migrate` | Run database migrations |
| `pnpm seed` | Seed demo data |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm test:setup` | Create test database + run migrations |

## Architecture

```
Frontend (React)
    │  tRPC (type-safe)
    ▼
Routes → Services → Repositories → PostgreSQL
              │
              └→ AI Service → Provider (OpenAI/Anthropic/Mock)
```

- **Routes** — Input validation (Zod) + auth check
- **Services** — Business logic + ownership checks
- **Repositories** — Prisma queries only
- **AI Service** — Provider-agnostic LLM abstraction

AI responses stream via Server-Sent Events (`POST /api/chat/generate`).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown.

## Deployment

### Tailscale / Mac Mini

```bash
bin/tailscale-prod.sh
# → http://<tailscale-ip>:3000
```

### Docker (VPS)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for all scenarios.

## Project Structure

```
basecamp/
├── app/
│   ├── backend/     # Express + tRPC + Prisma
│   ├── frontend/    # React + Vite + TanStack Router
│   └── shared/      # Zod schemas, types, utilities
├── tests/
│   ├── unit/        # Schema + service tests
│   ├── integration/ # tRPC + API tests (with test DB)
│   ├── e2e/         # Playwright browser tests
│   └── evals/       # AI output validation
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── DESIGN_SYSTEM.md
│   └── AI_GUIDE.md
├── docker/          # Dockerfile + nginx.conf
├── bin/             # Dev + deploy scripts
└── docker-compose.yml
```

## Docs

- **[Architecture](docs/ARCHITECTURE.md)** — Layered design, data flow, decisions
- **[Deployment](docs/DEPLOYMENT.md)** — Tailscale, VPS, cloud scenarios
- **[Design System](docs/DESIGN_SYSTEM.md)** — Theming, components, conventions
- **[AI Guide](docs/AI_GUIDE.md)** — Patterns for AI coding agents

## Building From This Template

1. Clone the repo
2. Find-and-replace `basecamp` → `your-app-name`
3. Update `package.json` names, Prisma schema, Docker image names
4. Delete the sample chat domain (`routes/chat.ts`, `services/chatService.ts`, `repositories/chatRepository.ts`, `components/app/Chat*.tsx`)
5. Keep the infrastructure: auth, AI service, tRPC setup, tests, Docker
6. Start building your domain logic
