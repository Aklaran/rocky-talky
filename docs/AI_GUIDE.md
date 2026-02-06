# AI Agent Guide

Guide for AI coding agents working on Basecamp or apps built from it.

## Quick Orientation

```
app/backend/src/
├── routes/         ← tRPC routers (input validation, auth)
├── services/       ← Business logic (start here for features)
├── repositories/   ← Prisma queries (data access only)
├── lib/            ← Shared setup (env, session, tRPC init)
└── app.ts          ← Express app (middleware, route registration)

app/frontend/src/
├── routes/         ← Pages (file-based routing via TanStack Router)
├── components/
│   ├── ui/         ← shadcn/ui primitives (don't edit unless theming)
│   └── app/        ← Application components (edit these)
├── hooks/          ← React hooks (auth, streaming)
└── lib/            ← tRPC client, utilities

app/shared/
├── schemas/        ← Zod schemas (shared validation + types)
└── util/           ← Logger, helpers

tests/
├── unit/           ← No DB, no network
├── integration/    ← Uses test DB (resetDb between tests)
├── e2e/            ← Playwright browser tests
└── evals/          ← AI output schema validation
```

## Adding a Feature (Checklist)

1. **Schema** — Define Zod schemas in `app/shared/schemas/` for inputs and outputs
2. **Prisma model** — Add to `app/backend/prisma/schema.prisma`, run `pnpm migrate:dev`
3. **Repository** — Add data access functions in `repositories/`. Prisma queries only.
4. **Service** — Add business logic in `services/`. Ownership checks, orchestration.
5. **Route** — Add tRPC procedure in `routes/`. Wire input validation + auth.
6. **Register route** — Add to `routes/root.ts` (the router composition file)
7. **Frontend** — Add page in `routes/`, components in `components/app/`
8. **Tests** — Unit test for schema, integration test for route, update E2E if needed

## Patterns to Follow

### tRPC Procedures

```typescript
// In routes/myfeature.ts
export const myRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return myService.list(ctx.user.id)
  }),

  create: protectedProcedure
    .input(createSchema)             // Zod validation
    .mutation(async ({ ctx, input }) => {
      return myService.create(ctx.user.id, input)
    }),
})
```

### Services

```typescript
// In services/myService.ts
export async function list(userId: string) {
  const items = await myRepo.listByUser(userId)
  return items.map(toOutput)  // Shape for API response
}
```

### Repositories

```typescript
// In repositories/myRepository.ts
export async function listByUser(userId: string) {
  return prisma.myModel.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}
```

## Patterns to Avoid

| Don't | Do Instead |
|-------|-----------|
| Call Prisma from routes | Call service, which calls repository |
| Throw HTTP errors from repositories | Return null/empty, let service throw `TRPCError` |
| Access `req`/`res` in services | Pass specific params (userId, input) |
| Import backend code in frontend | Import from `@shared/` for shared types |
| Use raw colors (`bg-blue-500`) | Use semantic tokens (`bg-primary`) |
| Add AI logic to routes | Use `aiService` — swap providers via env var |
| Write tests that depend on test order | Use `beforeEach` with `resetDb()` |

## Testing

### Running Tests

```bash
pnpm test              # Unit + integration (Vitest)
pnpm test:watch        # Watch mode
pnpm test:e2e          # Playwright browser tests
```

### Writing Integration Tests

```typescript
import { createAuthenticatedCaller } from '../setup/trpc'
import { resetDb, disconnectDb, prisma } from '../setup/db'

// Create a real user + authenticated tRPC caller
const user = await prisma.user.create({ data: { email, passwordHash: 'fake' } })
const caller = createAuthenticatedCaller(user)

// Call procedures directly — no HTTP
const result = await caller.myFeature.list()
```

### Test Database

Tests use `basecamp_test` database (see `.env.test`). Run `pnpm test:setup` to create it.

## AI Integration

### Adding AI to a Feature

```typescript
import * as aiService from './aiService'

// Non-streaming
const response = await aiService.chat(messages, { temperature: 0.7 })

// Streaming
for await (const chunk of aiService.chatStream(messages)) {
  // yield or send chunk to client
}
```

### Adding a New AI Provider

1. Create `services/providers/myprovider.ts` implementing `AIProvider`
2. Add the case to `getProvider()` in `services/aiService.ts`
3. Add env vars to `shared/schemas/env.ts`
4. Document in `.env.example`

## Conventions

- **File naming:** camelCase for files, PascalCase for React components
- **Exports:** Named exports (not default), except for routes and the Express app
- **Error handling:** `TRPCError` in services, try/catch in REST routes
- **Logging:** Use `logger` from `@shared/util/logger` (Pino, structured JSON)
- **Env vars:** Validated at startup via Zod in `shared/schemas/env.ts`
- **Path aliases:** `@backend/`, `@shared/`, `@/` (frontend src)

## Demo Account

Seed data creates a demo account: `demo@basecamp.dev` / `password123`

```bash
pnpm seed
```
