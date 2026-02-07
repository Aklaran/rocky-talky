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
    bindExtensions: vi.fn(async () => {}),
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

    it('calls bindExtensions after session creation', async () => {
      await agentBridge.createSession('bind-ext-1')

      expect(mockSession.bindExtensions).toHaveBeenCalledOnce()
    })

    it('passes uiContext with correct ExtensionUIContext shape (not nested under .ui)', async () => {
      await agentBridge.createSession('bind-ext-shape')

      const call = mockSession.bindExtensions.mock.calls[0][0]
      const uiContext = call.uiContext

      // uiContext must BE the ExtensionUIContext, not wrap it under .ui
      // The extension runner sets ctx.ui = uiContext, so if we nest it as
      // { ui: { setWidget } }, then ctx.ui.setWidget becomes undefined.
      expect(uiContext).not.toHaveProperty('ui')

      // Required ExtensionUIContext methods that extensions (like Sirdar) call
      expect(uiContext.notify).toBeInstanceOf(Function)
      expect(uiContext.setStatus).toBeInstanceOf(Function)
      expect(uiContext.setWidget).toBeInstanceOf(Function)
      expect(uiContext.select).toBeInstanceOf(Function)
      expect(uiContext.confirm).toBeInstanceOf(Function)
      expect(uiContext.setWorkingMessage).toBeInstanceOf(Function)
    })

    it('uiContext no-ops do not throw when called', async () => {
      await agentBridge.createSession('bind-ext-noop')

      const { uiContext } = mockSession.bindExtensions.mock.calls[0][0]

      // Sirdar's updateAgentWidget calls setWidget — this must not throw
      expect(() => uiContext.setWidget('agent-output', ['line1', 'line2'])).not.toThrow()
      expect(() => uiContext.setWidget('agent-output', undefined)).not.toThrow()
      expect(() => uiContext.notify('test', 'info')).not.toThrow()
      expect(() => uiContext.setStatus('key', 'value')).not.toThrow()
      expect(() => uiContext.setStatus('key', undefined)).not.toThrow()
      expect(() => uiContext.setWorkingMessage('loading...')).not.toThrow()
      expect(uiContext.select('title', ['a', 'b'])).resolves.toBeUndefined()
      expect(uiContext.confirm('sure?', 'really?')).resolves.toBe(false)
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

    it('emits subagent_spawn event when spawn_agent tool starts', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'tool_execution_start',
            toolCallId: 'spawn-call-1',
            toolName: 'spawn_agent',
            args: { 
              description: 'Fix bug in auth service', 
              prompt: 'Fix the login issue',
              tier: 'standard' 
            },
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('subagent-spawn-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('subagent-spawn-1', 'fix bug')) {
        events.push(event)
      }

      const spawnEvent = events.find((e) => e.type === 'subagent_spawn')
      expect(spawnEvent).toBeDefined()
      
      if (spawnEvent?.type === 'subagent_spawn') {
        expect(spawnEvent.toolCallId).toBe('spawn-call-1')
        expect(spawnEvent.description).toBe('Fix bug in auth service')
        expect(spawnEvent.tier).toBe('standard')
        expect(spawnEvent.prompt).toBe('Fix the login issue')
      }
    })

    it('emits subagent_result event when spawn_agent tool completes', async () => {
      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          listener({
            type: 'tool_execution_start',
            toolCallId: 'spawn-call-2',
            toolName: 'spawn_agent',
            args: { description: 'test', prompt: 'test', tier: 'light' },
          })
          listener({
            type: 'tool_execution_end',
            toolCallId: 'spawn-call-2',
            toolName: 'spawn_agent',
            isError: false,
            result: 'Task spawned successfully. Task ID: task-abc-123\nStatus: running',
          })
          listener({ type: 'agent_end', messages: [] })
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('subagent-result-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('subagent-result-1', 'spawn')) {
        events.push(event)
      }

      const resultEvent = events.find((e) => e.type === 'subagent_result')
      expect(resultEvent).toBeDefined()
      
      if (resultEvent?.type === 'subagent_result') {
        expect(resultEvent.toolCallId).toBe('spawn-call-2')
        expect(resultEvent.taskId).toBe('task-abc-123')
        expect(resultEvent.status).toBe('running')
      }
    })

    it('emits subagent_output events when setWidget is called', async () => {
      let capturedUIContext: any = null

      mockSession.bindExtensions.mockImplementation(async (opts: any) => {
        capturedUIContext = opts.uiContext
      })

      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          // Simulate widget update during agent execution
          setTimeout(() => {
            if (capturedUIContext) {
              capturedUIContext.setWidget('agent-output', ['Line 1', 'Line 2', 'Line 3'])
            }
          }, 5)
          setTimeout(() => {
            listener({ type: 'agent_end', messages: [] })
          }, 20)
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('widget-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('widget-1', 'test')) {
        events.push(event)
      }

      const outputEvents = events.filter((e) => e.type === 'subagent_output')
      expect(outputEvents).toHaveLength(1)
      
      if (outputEvents[0]?.type === 'subagent_output') {
        expect(outputEvents[0].lines).toEqual(['Line 1', 'Line 2', 'Line 3'])
      }
    })

    it('emits subagent_complete event when notify is called with completion message', async () => {
      let capturedUIContext: any = null

      mockSession.bindExtensions.mockImplementation(async (opts: any) => {
        capturedUIContext = opts.uiContext
      })

      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          setTimeout(() => {
            if (capturedUIContext) {
              capturedUIContext.notify('Agent task-xyz-789 completed: Fixed the bug', 'success')
            }
          }, 5)
          setTimeout(() => {
            listener({ type: 'agent_end', messages: [] })
          }, 20)
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('notify-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('notify-1', 'test')) {
        events.push(event)
      }

      const completeEvents = events.filter((e) => e.type === 'subagent_complete')
      expect(completeEvents).toHaveLength(1)
      
      if (completeEvents[0]?.type === 'subagent_complete') {
        expect(completeEvents[0].taskId).toBe('task-xyz-789')
        expect(completeEvents[0].description).toBe('Fixed the bug')
        expect(completeEvents[0].success).toBe(true)
      }
    })

    it('emits subagent_complete with success=false when notify is called with failure message', async () => {
      let capturedUIContext: any = null

      mockSession.bindExtensions.mockImplementation(async (opts: any) => {
        capturedUIContext = opts.uiContext
      })

      mockSession.subscribe.mockImplementation((listener: any) => {
        setTimeout(() => {
          listener({ type: 'agent_start' })
          setTimeout(() => {
            if (capturedUIContext) {
              capturedUIContext.notify('Agent task-fail-123 failed: Timeout exceeded', 'error')
            }
          }, 5)
          setTimeout(() => {
            listener({ type: 'agent_end', messages: [] })
          }, 20)
        }, 10)
        return vi.fn()
      })

      mockSession.prompt.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      await agentBridge.createSession('notify-fail-1')
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage('notify-fail-1', 'test')) {
        events.push(event)
      }

      const completeEvents = events.filter((e) => e.type === 'subagent_complete')
      expect(completeEvents).toHaveLength(1)
      
      if (completeEvents[0]?.type === 'subagent_complete') {
        expect(completeEvents[0].taskId).toBe('task-fail-123')
        expect(completeEvents[0].description).toBe('Timeout exceeded')
        expect(completeEvents[0].success).toBe(false)
      }
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
