# Basecamp Audit Report

**Date:** 2026-02-06
**Auditor:** Annapurna
**Scope:** Full codebase — security + code cleanliness (single pass)
**Commit:** `ddf41b5` (Phase 5: E2E tests, docs, cleanup)

---

## Summary

The codebase is **well-structured and thoughtfully built**. No critical vulnerabilities were found — the foundations (Prisma ORM, Zod validation, httpOnly cookies, argon2 hashing, sameSite cookies) are all correct choices that prevent entire categories of attacks by default.

The findings below are hardening measures for a production-grade template, not emergency fixes.

### Severity Scale
- 🔴 **Critical** — exploit now, fix now
- 🟠 **High** — real attack surface, fix before production traffic
- 🟡 **Medium** — defense-in-depth, fix soon
- 🟢 **Low** — best practice, fix at leisure
- 🔵 **Info** — observation, no action needed

---

## Part 1: Security Audit

### 🟠 S1 — No Rate Limiting on Auth Endpoints

**Files:** `app/backend/src/routes/auth.ts`, `app/backend/src/app.ts`
**Risk:** Brute-force password attacks, credential stuffing, account enumeration via timing

Login and register endpoints have no rate limiting. An attacker can try unlimited passwords per second. The `nginx.conf` has a rate limit zone *commented out* and only targets `/api/trpc/auth` (which doesn't even exist — auth is at `/api/auth`).

**Fix:** Add `express-rate-limit` middleware directly in Express (don't rely on nginx, since Tailscale deployment skips nginx entirely):

```ts
// app/backend/src/app.ts
import rateLimit from 'express-rate-limit'

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
```

Also add a general API rate limiter:
```ts
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
})
app.use('/api/', apiLimiter)
```

**Severity:** 🟠 High

---

### 🟠 S2 — No Session Regeneration After Login (Session Fixation)

**File:** `app/backend/src/routes/auth.ts`
**Risk:** Session fixation attack

After successful login/register, the existing session ID is reused. If an attacker can set a victim's session cookie before they log in (e.g., via a subdomain or shared-domain attack), the attacker knows the session ID and gains access after the victim authenticates.

**Fix:** Regenerate the session after authentication:

```ts
// In both /register and /login handlers, after verifying credentials:
const oldSession = req.session
req.session.regenerate((err) => {
  if (err) { /* handle error */ }
  // Copy over the userId
  req.session.userId = user.id
  req.session.save((err) => {
    if (err) { /* handle error */ }
    res.status(200).json({ user })
  })
})
```

**Severity:** 🟠 High (standard OWASP recommendation)

---

### 🟡 S3 — No Request Body Size Limit

**File:** `app/backend/src/app.ts`
**Risk:** Denial of service via large payloads

`express.json()` defaults to a 100KB limit, which is reasonable. However, the SSE streaming endpoint at `/api/chat/generate` accepts POST bodies and there's no explicit limit. More importantly, the message schema allows up to 32,000 characters per message — combined with no rate limiting, an attacker could flood the database.

**Fix:** Make the body limit explicit and add a streaming endpoint rate limiter:

```ts
app.use(express.json({ limit: '100kb' }))
```

Consider a per-user rate limit on `/api/chat/generate` to prevent AI cost abuse.

**Severity:** 🟡 Medium

---

### 🟡 S4 — No Security Headers (Helmet)

**File:** `app/backend/src/app.ts`
**Risk:** Missing defense-in-depth headers when nginx is not in front (Tailscale deployment)

The nginx config sets `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, and `Referrer-Policy`. But the Tailscale production deployment **bypasses nginx entirely** — Express serves everything directly. Those headers are never set.

**Fix:** Add `helmet` middleware:

```bash
pnpm add helmet -w app/backend
```

```ts
import helmet from 'helmet'
app.use(helmet())
```

This adds: CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, and more.

**Severity:** 🟡 Medium

---

### 🟡 S5 — SSE Stream Has No Timeout or Token Limit

**File:** `app/backend/src/routes/stream.ts`
**Risk:** Resource exhaustion, runaway AI costs

If the AI provider hangs or generates an extremely long response, the SSE connection stays open indefinitely. There's no:
- Server-side timeout for the stream
- Maximum token/character limit for accumulated content
- Per-user concurrency limit (a user could open many simultaneous streams)

**Fix:**

```ts
// Add a timeout
const STREAM_TIMEOUT_MS = 60_000 // 60 seconds
const timeout = setTimeout(() => {
  aborted = true
  sendSSE(res, 'error', { error: 'Response timeout' })
  res.end()
}, STREAM_TIMEOUT_MS)

// In the finally block:
clearTimeout(timeout)

// Add a max content length
const MAX_CONTENT_LENGTH = 50_000
// In the while loop:
if (fullContent.length > MAX_CONTENT_LENGTH) {
  sendSSE(res, 'error', { error: 'Response too long' })
  break
}
```

**Severity:** 🟡 Medium

---

### 🟡 S6 — `trust proxy` Set to `1` Unconditionally

**File:** `app/backend/src/app.ts`
**Risk:** IP spoofing if exposed directly to the internet

`app.set('trust proxy', 1)` tells Express to trust `X-Forwarded-For` from one hop. This is correct behind nginx/Caddy, but if Express is directly exposed (Tailscale deployment without a reverse proxy), a client could spoof their IP by setting `X-Forwarded-For` headers. This would defeat IP-based rate limiting.

**Fix:** Make it configurable:

```ts
if (env.NODE_ENV === 'production' && process.env.TRUST_PROXY) {
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY) || 1)
}
```

Or for Tailscale (no proxy): don't set it at all.

**Severity:** 🟡 Medium

---

### 🟢 S7 — nginx Rate Limit Config is Broken

**File:** `docker/nginx.conf`
**Risk:** False sense of security

Two issues:
1. The `limit_req_zone` directive is commented out ("goes in http context — include via separate file")
2. The rate limit targets `/api/trpc/auth` but auth routes are at `/api/auth` (REST, not tRPC)

Even if uncommented, it wouldn't protect auth endpoints.

**Fix:** Since S1 recommends app-level rate limiting, this nginx config should be corrected for completeness or the broken stanza removed to avoid confusion.

**Severity:** 🟢 Low (moot if S1 is implemented)

---

### 🟢 S8 — Session Cookie `maxAge` is 7 Days with No Sliding Window

**File:** `app/backend/src/lib/clients/session.ts`
**Risk:** Stale sessions, no idle timeout

The session lives for 7 days regardless of activity. A stolen session cookie is valid for a full week. There's no idle timeout (session expires after N minutes of inactivity).

**Fix:** Consider:
- Reducing `maxAge` to 24 hours
- Implementing `rolling: true` in session config (resets expiry on each request)
- Or adding an absolute session lifetime + idle timeout

```ts
cookie: {
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
},
rolling: true, // Reset expiry on each request
```

**Severity:** 🟢 Low

---

### 🟢 S9 — Demo Seed Credentials in Production-Reachable Path

**File:** `app/backend/prisma/seed/seed.ts`
**Risk:** If someone runs `pnpm seed` in production, a known-password account exists

The seed creates `demo@basecamp.dev` with `password123`. This is fine for dev, but there's no guard against running it in production.

**Fix:** Add an environment check:

```ts
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seed should not run in production')
  process.exit(1)
}
```

**Severity:** 🟢 Low

---

### 🔵 S10 — Observations (No Action Needed)

**Good practices already in place:**
- ✅ **No SQL injection** — Prisma ORM with parameterized queries everywhere. The one `$queryRaw` usage is a tagged template literal (`SELECT 1`), which Prisma parameterizes.
- ✅ **No XSS** — React auto-escapes all rendered content. No `dangerouslySetInnerHTML`. Message content rendered via `{message.content}` in JSX.
- ✅ **CSRF protection** — `sameSite: 'lax'` on cookies blocks cross-origin POST. All state-changing operations are POST/mutation. The SSE endpoint also requires session auth via cookie.
- ✅ **Password hashing** — argon2 with default (strong) settings.
- ✅ **httpOnly cookies** — Session cookie not accessible via JavaScript.
- ✅ **No credential leaks** — `.env` is gitignored and not committed. API keys only in `.env` file on disk. `.env.test` has no real secrets (test DB, mock provider).
- ✅ **Input validation** — Zod schemas on all inputs (auth, chat, env). Message content capped at 32KB.
- ✅ **Error information hiding** — Login doesn't reveal whether email exists. Internal errors return generic messages. tRPC errors logged server-side only.
- ✅ **Ownership isolation** — Every data access checks `userId`. Conversation not found returns 404 whether it doesn't exist or belongs to someone else.
- ✅ **Cascade deletes** — User deletion cascades to conversations and messages via DB foreign keys.
- ✅ **No dependency vulnerabilities** — `pnpm audit` clean.

---

## Part 2: Code Cleanliness Audit

### 🟡 C1 — Anthropic Provider Stub Throws in Constructor

**File:** `app/backend/src/services/providers/anthropic.ts`

The constructor throws an error. This means if someone sets `AI_PROVIDER=anthropic` without reading the code, they get a crash at runtime (first AI request, not startup). The `getProvider()` factory in `aiService.ts` will catch this if the key is missing, but if the key IS set, it'll instantiate the provider and throw.

**Fix:** Either:
- Don't register the provider in the factory until the SDK is installed (check with a dynamic import try/catch)
- Or log a warning and return `null` from the factory case instead of calling the constructor

**Severity:** 🟡 Medium (poor DX for template users)

---

### 🟢 C2 — Commented-Out Code in Anthropic Provider

**File:** `app/backend/src/services/providers/anthropic.ts:21`

```ts
// this.client = new Anthropic({ apiKey })
```

This is the only commented-out code in the codebase. It's there as a breadcrumb for implementation, which is fine in a template. Consider converting to a more explicit instruction in the doc comment instead.

**Severity:** 🟢 Low

---

### 🟢 C3 — `pino-pretty` Used in Production

**File:** `app/shared/util/logger.ts`

Both dev and production use `pino-pretty` as the transport. In production, structured JSON logs are preferred for log aggregation (CloudWatch, Datadog, etc.).

**Fix:**

```ts
const getTransport = () => {
  if (isDevelopment) {
    return {
      target: 'pino-pretty',
      options: { colorize: true },
    }
  }
  return undefined // Pino defaults to JSON output
}
```

**Severity:** 🟢 Low (matters when you have log infrastructure)

---

### 🟢 C4 — `shared/types/index.ts` is Empty

**File:** `app/shared/types/index.ts`

Contains only a comment: `// Shared types — add domain types here as the app grows`. This is fine as a placeholder in a template. No action needed unless you want to remove it for minimalism.

**Severity:** 🟢 Low (intentional placeholder)

---

### 🟢 C5 — Section Divider Comments are Verbose

**Files:** Multiple (`chatService.ts`, `aiService.ts`, `chatRepository.ts`, `authService.ts`)

The `// ====...====` divider pattern is used extensively. This is a style choice, not a problem. It does add visual noise in smaller files where the sections are already obvious from the function names.

**Severity:** 🟢 Low (style preference)

---

### 🔵 C6 — Positive Observations

- ✅ **No TODOs, FIXMEs, or HACKs** in the source code. Zero. Clean.
- ✅ **Consistent naming** — camelCase for functions/variables, PascalCase for types/classes, snake_case for DB columns with Prisma `@map`. All consistent.
- ✅ **Clean layering** — Routes → Services → Repositories. No layer violations.
- ✅ **Every function has a JSDoc comment** explaining what it does and any non-obvious behavior.
- ✅ **Error handling is thorough** — try/catch in every route handler, typed custom errors (`AuthError`), graceful fallbacks in AI service.
- ✅ **No unused imports** — TypeScript compiles cleanly with `--noEmit`.
- ✅ **Schemas are shared** — Frontend and backend use the same Zod schemas. Single source of truth.
- ✅ **Test isolation** — Separate test DB, mock AI provider, no test pollution.
- ✅ **Build is clean** — Multi-stage Docker, no dev dependencies in production image.

---

## Recommended Fix Priority

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| S1 | Rate limiting on auth | ~30 min | High |
| S2 | Session regeneration after login | ~20 min | High |
| S4 | Helmet security headers | ~10 min | Medium |
| S5 | SSE stream timeout + limits | ~30 min | Medium |
| S3 | Explicit body size limit | ~5 min | Low |
| S6 | Configurable trust proxy | ~10 min | Low |
| C1 | Anthropic provider DX | ~15 min | Low |
| S9 | Seed production guard | ~5 min | Low |
| C3 | JSON logs in production | ~5 min | Low |
| S7 | Fix or remove nginx rate limit | ~5 min | Low |
| S8 | Session idle timeout | ~5 min | Low |

**Total estimated effort: ~2.5 hours**

---

*Audit complete. This is a solid template — the bones are right. These are finishing touches.*
