/**
 * Test Setup Routes — only available when NODE_ENV=test
 *
 * Provides endpoints to configure mocks and test state for E2E tests.
 */

import { Router, Request, Response } from 'express'
import * as agentBridgeService from '../services/agentBridgeService'
import logger from '@shared/util/logger'

const testSetupRouter: Router = Router()

// Only allow in test mode
testSetupRouter.use((_req: Request, res: Response, next) => {
  if (process.env.NODE_ENV !== 'test') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  next()
})

/**
 * POST /api/test/setup-mock-agent
 * Configure mock agent bridge for E2E tests.
 *
 * Body:
 * - shouldSpawnSubagent (boolean): Whether to simulate subagent spawning
 * - responseText (string): Custom response text
 * - notifyDelay (number): Delay before notify() fires (ms)
 */
testSetupRouter.post('/setup-mock-agent', (req: Request, res: Response) => {
  const {
    shouldSpawnSubagent = true,
    responseText = 'Spawning a test agent...',
    notifyDelay = 500,
  } = req.body

  logger.info({ shouldSpawnSubagent, responseText, notifyDelay }, 'Setting up mock agent bridge')

  // Store captured UI context so we can fire notify() later
  let capturedUiContext: any = null
  let capturedListener: any = null

  const mockSession = {
    subscribe: (listener: any) => {
      capturedListener = listener
      return () => {} // unsubscribe
    },

    prompt: async (_message: string) => {
      if (!capturedListener) {
        throw new Error('No listener subscribed')
      }

      // Simulate the event sequence
      setTimeout(() => {
        // 1. agent_start
        capturedListener({ type: 'agent_start' })

        if (shouldSpawnSubagent) {
          // Subagent flow

          // 2. Text response
          capturedListener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: responseText },
          })

          // 3. Tool start - spawn_agent
          capturedListener({
            type: 'tool_execution_start',
            toolCallId: 'tool-mock-1',
            toolName: 'spawn_agent',
            args: {
              description: 'Mock test task',
              tier: 'trivial-simple',
              prompt: 'Do something simple',
            },
          })

          // 4. Tool end - spawn_agent with MCP-shaped result (CRITICAL: matches real SDK)
          capturedListener({
            type: 'tool_execution_end',
            toolCallId: 'tool-mock-1',
            toolName: 'spawn_agent',
            isError: false,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Agent spawned: task-mock-12345 — Mock test task (model: claude-3-haiku-20240307, thinking: none)\nStatus: running',
                },
              ],
            },
          })

          // 5. More text
          capturedListener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: ' Agent is running.' },
          })

          // 6. agent_end
          capturedListener({ type: 'agent_end', messages: [] })

          // 7. After a delay, call notify() via captured uiContext (simulates async completion)
          setTimeout(() => {
            if (capturedUiContext?.notify) {
              // Use Sirdar's real format (this caught production bugs!)
              capturedUiContext.notify(
                '✅ Agent completed: task-mock-12345\nMock test task',
                'info'
              )
            }
          }, notifyDelay)
        } else {
          // Simple text response (no subagent)
          capturedListener({
            type: 'message_update',
            assistantMessageEvent: {
              type: 'text_delta',
              delta: 'This is a simple response without spawning any subagents.',
            },
          })

          capturedListener({ type: 'agent_end', messages: [] })
        }
      }, 50) // Small delay to simulate async
    },

    bindExtensions: async (opts: any) => {
      // Capture uiContext so we can call notify() later
      if (opts?.uiContext) {
        capturedUiContext = opts.uiContext
      }
    },

    dispose: () => {
      // no-op
    },
  }

  // Mock SDK
  const mockSdk = {
    AuthStorage: class {},
    ModelRegistry: class {
      constructor() {}
    },
    SessionManager: {
      inMemory: () => ({}),
    },
    DefaultResourceLoader: class {
      constructor() {}
      async reload() {}
    },
    createAgentSession: async () => ({
      session: mockSession,
    }),
  }

  // Mock AI
  const mockAi = {
    getModel: () => ({
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4',
    }),
  }

  // Inject the mock into agentBridgeService
  agentBridgeService._setSDKForTesting(mockSdk, mockAi)

  res.json({ success: true, config: { shouldSpawnSubagent, responseText, notifyDelay } })
})

/**
 * POST /api/test/reset-mock-agent
 * Reset agent bridge to use real SDK (clear mocks).
 */
testSetupRouter.post('/reset-mock-agent', (_req: Request, res: Response) => {
  logger.info('Resetting mock agent bridge')
  agentBridgeService._setSDKForTesting(null, null)
  res.json({ success: true })
})

export default testSetupRouter
