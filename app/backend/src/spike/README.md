# Agent Bridge Spike Tests

This directory contains standalone scripts to validate the Pi SDK integration.

## Running the Spike Test

Due to ESM module resolution issues with tsx, the spike test should be run via the backend service rather than as a standalone script.

### Option 1: Via tRPC (Recommended)

1. Start the backend dev server:
   ```bash
   cd app/backend
   pnpm dev
   ```

2. Make requests to the agent endpoints via tRPC
   - `agent.startSession` - Create a session
   - `agent.sendMessage` - Send a message
   - `agent.streamEvents` - Subscribe to events
   - `agent.stopSession` - Clean up

### Option 2: Integration Tests

Run the integration tests which exercise the same code paths:
```bash
pnpm test tests/integration/agent-bridge.test.ts
```

### Option 3: Direct Script (Requires ESM Config)

If you fix the ESM module resolution, you can run:
```bash
npx tsx app/backend/src/spike/agent-bridge-spike.ts
```

**Note:** This currently fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` due to Pi SDK's ESM-only exports. See `docs/phase-2-spike-findings.md` for details.

## What the Spike Tests Validate

1. **Session Creation** - Pi agent sessions can be created
2. **Annapurna Skill** - The agent identifies as Annapurna
3. **Message Streaming** - Responses stream as text deltas
4. **Tool Calls** - Agent can use tools (read, bash, etc.)
5. **Cleanup** - Sessions dispose properly

## Expected Behavior

When working correctly, you should see:
- ✓ Session created
- ✓ Agent identifies as "Annapurna"
- ✓ Streaming text responses
- ✓ Tool calls detected (e.g., Read tool for file access)
- ✓ Session disposed cleanly

## Troubleshooting

### `ERR_PACKAGE_PATH_NOT_EXPORTED`
The Pi SDK uses ESM-only exports. Ensure:
- `tsconfig.json` has `"module": "ESNext"`
- `package.json` has `"type": "module"` (or use `.mts` extension)
- Run via the backend service instead of standalone

### API Key Issues
Ensure `~/.pi/agent/auth.json` exists with valid Anthropic API keys:
```json
{
  "anthropic": "sk-ant-api03-..."
}
```

### Skill Not Loading
Check that `/home/annapurna/.pi/agent/skills/annapurna/SKILL.md` exists and is readable.
