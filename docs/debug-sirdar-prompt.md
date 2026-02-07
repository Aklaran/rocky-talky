# Debug Prompt: Sirdar Extension Not Initializing in Rocky Talky

Use this prompt to start a new context window for debugging.

---

## Context

Rocky Talky is a mobile chat app at `~/repos/rocky-talky` that uses the Pi SDK (`@mariozechner/pi-coding-agent`) to run AI agent sessions. The agent bridge service at `app/backend/src/services/agentBridgeService.ts` creates Pi SDK sessions via `createAgentSession()`.

The Sirdar orchestrator extension (at `~/.pi/agent/extensions/orchestrator/`) provides tools like `spawn_agent`, `check_agents`, etc. These tools ARE registered on the agent — we verified by inspecting `session.agent.state.tools` after creation. However, when the agent actually tries to CALL `spawn_agent` at runtime, it fails with **"agent pool not initialized"**.

## The Hypothesis

The Pi SDK's interactive mode calls `session.bindExtensions()` during startup, which:
1. Fires a `session_start` event to all extensions
2. Calls `extendResourcesFromExtensions()`

Rocky Talky's agent bridge **never calls `bindExtensions()`**. This likely means Sirdar's `session_start` handler never runs, so its internal agent pool is never initialized.

## Key Files to Read

1. **Agent bridge service** — `~/repos/rocky-talky/app/backend/src/services/agentBridgeService.ts` — the `createSession()` function
2. **Sirdar extension entry** — `~/.pi/agent/extensions/orchestrator/src/index.ts` — look for `session_start` handler and pool initialization
3. **Pi SDK AgentSession** — `~/repos/rocky-talky/app/backend/node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js` — `bindExtensions()` method (line ~1345) and `_buildRuntime()` (line ~1512)
4. **Pi SDK interactive mode** — `~/repos/rocky-talky/app/backend/node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js` — `initExtensions()` (line ~752) to see what bindings interactive mode provides
5. **Existing agent bridge tests** — `~/repos/rocky-talky/tests/integration/agent-bridge.test.ts`

## What To Do

1. **Read Sirdar's extension entry point** to understand what `session_start` does and what initialization the agent pool needs
2. **Write a failing test** that reproduces the "agent pool not initialized" error — mock or use the real SDK to create a session, skip `bindExtensions()`, and call `spawn_agent`
3. **Fix the bridge** — likely add `await session.bindExtensions({})` (or with minimal required bindings) after `createAgentSession()` in the bridge's `createSession()`
4. **Write a passing test** that proves spawn_agent works after the fix
5. **Check if `bindExtensions` needs real arguments** — the interactive mode passes `uiContext` and `commandContextActions`. Some of these might be needed for Sirdar to function (e.g., `waitForIdle`, `newSession`). If so, implement minimal stubs.
6. **Run `pnpm test`** to make sure nothing breaks

## Important Notes

- Pi SDK is ESM-only. The project uses `new Function('specifier', 'return import(specifier)')` to dynamically import it from CJS. See the `getSDK()` / `getAI()` functions in the bridge service.
- The bridge tests mock the Pi SDK — you may need both mock tests (fast, unit-level) and a real integration test (slower, actually loads SDK) to fully verify.
- Do NOT modify files in `~/.pi/agent/extensions/orchestrator/` — fix this on the Rocky Talky side.
- Commit with message: "fix: call bindExtensions on Pi SDK sessions for Sirdar initialization"
