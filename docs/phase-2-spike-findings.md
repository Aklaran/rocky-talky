# Phase 2 Spike Findings: Pi SDK Agent Bridge

**Date:** February 7, 2026
**Objective:** Validate that the Pi SDK can serve as the AI agent bridge for Rocky Talky.

---

## Decision: ✅ PROCEED with Pi SDK

The Pi SDK works well as the agent bridge. All required capabilities are validated.

---

## What Works

### Session Creation
- `createAgentSession()` works perfectly
- `SessionManager.inMemory()` for ephemeral sessions (we persist to Postgres)
- `AuthStorage` reads API keys from `~/.pi/agent/auth.json` automatically
- `DefaultResourceLoader` discovers skills and extensions from default paths

### Streaming
- `session.subscribe()` provides real-time events: `agent_start`, `message_update`, `tool_execution_start/end`, `agent_end`
- Text deltas via `event.assistantMessageEvent.type === 'text_delta'`
- Clean async generator pattern works for bridging subscribe → frontend

### Tool Calls
- `tool_execution_start` and `tool_execution_end` events fire with `toolCallId`, `toolName`, `args`
- Subagent spawning detectable via `toolName === 'spawn_agent'`

### Skills & Extensions
- Annapurna skill auto-loaded via `DefaultResourceLoader`
- Sirdar/orchestrator extension auto-loaded from `~/.pi/agent/extensions/`
- No manual configuration needed

### Model Configuration
- `getModel("anthropic", "claude-opus-4-6")` works
- Thinking level configurable (`"low"`, `"off"`, etc.)

### Session Lifecycle
- `session.dispose()` exists and works for cleanup
- `session.prompt()` for sending messages
- `session.subscribe()` returns an unsubscribe function

---

## Key Gotcha: ESM-Only

**The Pi SDK is ESM-only** (`"type": "module"` in package.json). Our backend uses CommonJS (`"module": "commonjs"` in tsconfig).

**Solution:** Dynamic `import()` works perfectly:
```typescript
const sdk = await import('@mariozechner/pi-coding-agent')
const ai = await import('@mariozechner/pi-ai')
```

Lazy-loaded once and cached. No performance impact after first import.

**Impact on testing:** `vi.mock()` doesn't intercept dynamic imports. Solution: injectable SDK loader (`_setSDKForTesting()`) for unit tests.

---

## Architecture for Phase 3

```
User types message
    ↓
Frontend calls tRPC agent.sendMessage
    ↓
agentBridgeService.sendMessage() — subscribes to Pi session events
    ↓
session.prompt() fires, events stream via subscribe()
    ↓
AsyncGenerator yields AgentEvent objects
    ↓
EventEmitter per session → tRPC subscription (SSE)
    ↓
Frontend renders streaming text, tool calls, completions
```

### Key Components Needed
1. **WebSocket or SSE transport** — tRPC subscriptions for real-time streaming
2. **Message persistence** — save user + assistant messages to Postgres as they stream
3. **Session rehydration** — load history from Postgres into new Pi sessions (or just display from DB)
4. **Context injection** — send Sanctuary docs / MEMORY.md content as system context
5. **Subagent tracking** — detect spawn_agent, create Subagent records, stream their output

---

## Open Questions for Phase 3

1. **Session persistence strategy:** Do we re-inject message history into new Pi sessions, or treat each Pi session as truly ephemeral and only show history from DB?
2. **Concurrent messages:** Can one Pi session handle overlapping prompt() calls? Likely needs serialization.
3. **Auto-compaction visibility:** When Pi auto-compacts, should we tell the user?
4. **Cost tracking:** Pi SDK events include `usage` on `AssistantMessage` — we can parse this for token/cost tracking.

---

*Validated: February 7, 2026*
*Confidence: 🟢 HIGH*
