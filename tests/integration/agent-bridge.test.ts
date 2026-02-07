import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as agentBridge from '@backend/services/agentBridgeService'

/**
 * Agent Bridge Unit Tests — uses SDK injection for mocking.
 */

function createMockSession() {
  return {
    subscribe: vi.fn(() => vi.fn()),
    prompt: vi.fn(async () => {}),
    dispose: vi.fn(),
    isStreaming: false,
    agent: {},
  }
}

function createMockSDK(mockSession: ReturnType<typeof createMockSession>) {
  const sdk = {
    createAgentSession: vi.fn(async () => ({
      session: mockSession,
      extensionsResult: { extensions: [], errors: [], runtime: {} },
    })),
    AuthStorage: vi.fn(function(this: any) {}),
    ModelRegistry: vi.fn(function(this: any) {}),
    DefaultResourceLoader: vi.fn(function(this: any) { this.reload = vi.fn(async () => {}) }),
    SessionManager: { inMemory: vi.fn(() => ({})) },
  }

  const ai = {
    getModel: vi.fn(() => ({ id: 'claude-opus-4-6', name: 'Claude Opus 4.6' })),
  }

  return { sdk, ai }
}

describe('Agent Bridge Service', () => {
  let mockSession: ReturnType<typeof createMockSession>
  let sdk: ReturnType<typeof createMockSDK>['sdk']
  let ai: ReturnType<typeof createMockSDK>['ai']

  beforeEach(async () => {
    mockSession = createMockSession()
    const mocks = createMockSDK(mockSession)
    sdk = mocks.sdk
    ai = mocks.ai
    agentBridge._setSDKForTesting(sdk, ai)
    await agentBridge.disposeAllSessions()
  })

  afterEach(async () => {
    await agentBridge.disposeAllSessions()
    agentBridge._setSDKForTesting(null, null)
  })

  describe('Session Management', () => {
    it('creates a new agent session', async () => {
      const info = await agentBridge.createSession('test-1')

      expect(info.sessionId).toBe('test-1')
      expect(info.createdAt).toBeInstanceOf(Date)
      expect(sdk.createAgentSession).toHaveBeenCalledOnce()
    })

    it('throws on duplicate session', async () => {
      await agentBridge.createSession('test-2')
      await expect(agentBridge.createSession('test-2')).rejects.toThrow(/already exists/)
    })

    it('retrieves existing session', async () => {
      await agentBridge.createSession('test-3')
      const retrieved = agentBridge.getSession('test-3')
      expect(retrieved).not.toBeNull()
      expect(retrieved?.sessionId).toBe('test-3')
    })

    it('returns null for non-existent session', () => {
      expect(agentBridge.getSession('nope')).toBeNull()
    })

    it('disposes a session and calls dispose on Pi session', async () => {
      await agentBridge.createSession('test-4')
      const disposed = await agentBridge.disposeSession('test-4')
      expect(disposed).toBe(true)
      expect(agentBridge.getSession('test-4')).toBeNull()
      expect(mockSession.dispose).toHaveBeenCalled()
    })

    it('returns false disposing non-existent session', async () => {
      expect(await agentBridge.disposeSession('nope')).toBe(false)
    })

    it('tracks active session count', async () => {
      expect(agentBridge.getActiveSessionCount()).toBe(0)
      await agentBridge.createSession('a')
      await agentBridge.createSession('b')
      expect(agentBridge.getActiveSessionCount()).toBe(2)
      await agentBridge.disposeAllSessions()
      expect(agentBridge.getActiveSessionCount()).toBe(0)
    })
  })

  describe('Message Handling', () => {
    it('sends a message and yields events', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'Hello' },
          })
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: ' world' },
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('msg-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('msg-1', 'Hello')) {
        events.push(event)
      }

      const textEvents = events.filter((e) => e.type === 'text') as agentBridge.AgentEventText[]
      expect(textEvents.length).toBe(2)
      expect(textEvents.map((e) => e.content).join('')).toBe('Hello world')
      expect(events.some((e) => e.type === 'completion')).toBe(true)
    })

    it('throws for non-existent session', async () => {
      await expect(async () => {
        for await (const _ of agentBridge.sendMessage('nope', 'hi')) {
          // should not reach
        }
      }).rejects.toThrow(/No agent session found/)
    })

    it('detects tool calls', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'tool_execution_start',
            toolCallId: 'call-1',
            toolName: 'Read',
            args: { path: '/tmp/test' },
          })
          listener({
            type: 'tool_execution_end',
            toolCallId: 'call-1',
            toolName: 'Read',
            isError: false,
          })
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'Done' },
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('tool-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('tool-1', 'read a file')) {
        events.push(event)
      }

      const toolStart = events.find((e) => e.type === 'tool_start') as agentBridge.AgentEventToolStart
      expect(toolStart).toBeDefined()
      expect(toolStart.toolName).toBe('Read')

      const toolEnd = events.find((e) => e.type === 'tool_end') as agentBridge.AgentEventToolEnd
      expect(toolEnd).toBeDefined()
      expect(toolEnd.isError).toBe(false)
    })

    it('detects subagent spawning', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'tool_execution_start',
            toolCallId: 'call-1',
            toolName: 'spawn_agent',
            args: { description: 'test task', prompt: 'do something', tier: 'light' },
          })
          listener({
            type: 'tool_execution_end',
            toolCallId: 'call-1',
            toolName: 'spawn_agent',
            isError: false,
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('subagent-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('subagent-1', 'spawn')) {
        events.push(event)
      }

      const toolStart = events.find(
        (e) => e.type === 'tool_start' && (e as agentBridge.AgentEventToolStart).toolName === 'spawn_agent',
      ) as agentBridge.AgentEventToolStart
      expect(toolStart).toBeDefined()
      expect(toolStart.args).toEqual(expect.objectContaining({ description: 'test task' }))
    })

    it('handles prompt errors gracefully', async () => {
      mockSession.subscribe.mockImplementation(() => vi.fn())
      mockSession.prompt.mockRejectedValue(new Error('API rate limit'))

      await agentBridge.createSession('err-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('err-1', 'hello')) {
        events.push(event)
      }

      const errorEvent = events.find((e) => e.type === 'error') as agentBridge.AgentEventError
      expect(errorEvent).toBeDefined()
      expect(errorEvent.error).toContain('API rate limit')
    })

    it('handles auto-compaction events', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'Processing...' },
          })
          listener({
            type: 'auto_compaction_start',
            reason: 'threshold',
          })
          listener({
            type: 'auto_compaction_end',
            aborted: false,
            result: {},
          })
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'Done!' },
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('compact-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('compact-1', 'test')) {
        events.push(event)
      }

      const compactionStart = events.find(
        (e) => e.type === 'compaction_start',
      ) as agentBridge.AgentEventCompactionStart
      expect(compactionStart).toBeDefined()
      expect(compactionStart.reason).toBe('threshold')

      const compactionEnd = events.find(
        (e) => e.type === 'compaction_end',
      ) as agentBridge.AgentEventCompactionEnd
      expect(compactionEnd).toBeDefined()
      expect(compactionEnd.aborted).toBe(false)
    })

    it('handles auto-compaction errors', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'auto_compaction_start',
            reason: 'overflow',
          })
          listener({
            type: 'auto_compaction_end',
            aborted: true,
            errorMessage: 'Compaction timeout',
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('compact-err-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('compact-err-1', 'test')) {
        events.push(event)
      }

      const compactionEnd = events.find(
        (e) => e.type === 'compaction_end',
      ) as agentBridge.AgentEventCompactionEnd
      expect(compactionEnd).toBeDefined()
      expect(compactionEnd.aborted).toBe(true)
      expect(compactionEnd.error).toBe('Compaction timeout')
    })
  })
})
