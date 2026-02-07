/**
 * Mock Pi SDK Session Fixture for E2E Testing
 *
 * This mock replaces the Pi SDK at the boundary to use realistic event formats.
 * It simulates the exact event shapes that caught production bugs:
 * 1. tool_execution_end.result is an MCP object {content:[{type:"text",text:"..."}]}, not a string
 * 2. Sirdar notify() sends "✅ Agent completed: task-xyz\nDescription"
 *
 * Use this in E2E tests to verify the full pipeline handles real SDK event formats.
 */

import type * as agentBridgeService from '../../../app/backend/src/services/agentBridgeService'

export interface MockSessionOptions {
  /** Whether to spawn a subagent during the message flow */
  shouldSpawnSubagent?: boolean
  /** Custom message response text */
  responseText?: string
  /** Delay before notify() fires (ms) */
  notifyDelay?: number
}

/**
 * Setup mock agent bridge for testing.
 * Call this during test setup to replace the Pi SDK with a mock.
 */
export function setupMockAgentBridge(options: MockSessionOptions = {}) {
  const {
    shouldSpawnSubagent = true,
    responseText = 'Spawning a test agent...',
    notifyDelay = 500,
  } = options

  // Store captured UI context so we can fire notify() later
  let capturedUiContext: any = null
  // Store listener so we can fire events
  let capturedListener: any = null

  const mockSession = {
    subscribe: (listener: any) => {
      capturedListener = listener
      return () => {} // unsubscribe function
    },

    prompt: async (message: string) => {
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

  return { mockSdk, mockAi, mockSession }
}

/**
 * Create a mock that returns a session without spawning subagents.
 */
export function setupSimpleMockAgentBridge() {
  return setupMockAgentBridge({
    shouldSpawnSubagent: false,
    responseText: 'This is a simple response without spawning any subagents.',
  })
}
