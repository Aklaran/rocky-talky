# Architecture

Basecamp is a full-stack monorepo with a layered backend, type-safe API, and AI integration.

## Directory Structure

```
basecamp/
├── app/
│   ├── backend/           # Express + tRPC + Prisma
│   │   ├── src/
│   │   │   ├── routes/    # tRPC routers + REST endpoints
│   │   │   ├── services/  # Business logic + AI provider layer
│   │   │   ├── repositories/  # Data access (Prisma queries only)
│   │   │   ├── lib/       # Clients, middleware, env validation
│   │   │   ├── app.ts     # Express app setup
│   │   │   └── server.ts  # Server entry point
│   │   └── prisma/        # Schema, migrations, seed
│   ├── frontend/          # React + Vite + TanStack Router
│   │   ├── src/
│   │   │   ├── routes/    # File-based pages (TanStack Router)
│   │   │   ├── components/
│   │   │   │   ├── ui/    # shadcn/ui base components
│   │   │   │   └── app/   # Application components
│   │   │   ├── hooks/     # React hooks (auth, AI streaming)
│   │   │   └── lib/       # tRPC client, utilities, SSE client
│   │   └── index.css      # Tailwind + design tokens
│   └── shared/            # Shared between frontend + backend
│       ├── schemas/       # Zod schemas (validation + types)
│       ├── util/          # Logger, helpers
│       └── constants/     # Shared constants
├── tests/
│   ├── unit/              # Service + schema tests (no DB)
│   ├── integration/       # tRPC + API tests (with test DB)
│   ├── e2e/               # Playwright browser tests
│   ├── evals/             # AI output validation
│   └── setup/             # Test helpers (DB reset, tRPC caller)
├── docker/                # Dockerfile + nginx.conf
├── bin/                   # Dev + deploy scripts
├── docs/                  # You are here
└── docker-compose*.yml    # Dev, prod, test compose files
```

## Data Flow

```
Frontend (React + TanStack Router)
    │
    │  tRPC client (type-safe, auto-inferred from AppRouter)
    │
    ▼
tRPC Router (routes/)
    │  Input validation (Zod), auth middleware
    │
    ▼
Service Layer (services/)
    │  Business logic, orchestration, ownership checks
    │  Calls aiService for LLM interactions
    │
    ▼
Repository Layer (repositories/)
    │  Prisma queries only — no business logic
    │
    ▼
PostgreSQL
```

For AI streaming, the flow is slightly different:

```
Frontend
    │
    │  fetch() + ReadableStream (SSE)
    │
    ▼
Express SSE Route (POST /api/chat/generate)
    │  Session auth, ownership check
    │
    ▼
Chat Service → AI Service → Provider (OpenAI/Anthropic/Mock)
    │  Streams chunks back as SSE events
    │  Saves complete message to DB on finish
    │
    ▼
Frontend updates progressively
```

## Key Patterns

### Layered Architecture

Each layer has a single responsibility:

| Layer | File Pattern | Responsibility |
|-------|-------------|----------------|
| **Route** | `routes/*.ts` | Input validation, auth check, response shaping |
| **Service** | `services/*.ts` | Business logic, ownership checks, orchestration |
| **Repository** | `repositories/*.ts` | Prisma queries. No business logic. |

Rules:
- Routes never call Prisma directly
- Repositories never throw HTTP errors
- Services never access `req` or `res`

### tRPC Type Safety

The frontend imports `AppRouter` from the backend via path alias — no codegen, no manual type syncing:

```typescript
// Frontend: auto-complete + type checking for all procedures
const { data } = trpc.chat.list.useQuery()
// data is typed as ConversationListItem[]
```

### Auth: Self-Hosted

- **argon2** for password hashing
- **express-session** + **connect-pg-simple** for sessions
- Session stored in Postgres, cookie sent to client
- `protectedProcedure` middleware in tRPC rejects unauthenticated requests
- Auth routes are REST (`/api/auth/*`), not tRPC — standard form POST pattern

### AI: Provider-Agnostic

The AI service (`services/aiService.ts`) defines an `AIProvider` interface:

```typescript
interface AIProvider {
  chat(messages, options?): Promise<string>
  chatStream(messages, options?): AsyncGenerator<string>
}
```

Implementations: `OpenAIProvider`, `AnthropicProvider` (stub), `MockProvider`.
Selected via `AI_PROVIDER` env var. Swap providers without changing any application code.

### Testing Strategy

Tests are integrated from Phase 1, not bolted on:

| Type | Tool | What it tests |
|------|------|---------------|
| **Unit** | Vitest | Schemas, services (mocked deps), providers |
| **Integration** | Vitest + test DB | Full tRPC procedure calls, SSE endpoint |
| **E2E** | Playwright | Complete user journey in the browser |
| **Evals** | Vitest | AI output schema validation |

Integration tests use `createCallerFactory` (tRPC v11) for direct procedure invocation — no HTTP encoding overhead. SSE tests use `supertest.agent` for session cookies.

## Decisions Log

| Decision | Choice | Why |
|----------|--------|-----|
| Auth | Self-hosted (argon2 + express-session) | No vendor lock-in, no paid deps |
| AI streaming | Express SSE (not tRPC subscriptions) | Simpler, testable, works with any frontend |
| Test DB | Separate `basecamp_test` database | Isolated from dev data |
| tRPC testing | `createCallerFactory` | Direct calls, no HTTP encoding issues |
| Monorepo | pnpm workspaces | Shared code, single lockfile |
| Styling | Tailwind + shadcn/ui | Agent-friendly (source code, not packages) |
| Dark mode | CSS custom properties + `dark` class | shadcn default, minimal effort |
