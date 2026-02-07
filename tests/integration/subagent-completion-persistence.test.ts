import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@backend/lib/clients/prisma'
import * as agentBridge from '@backend/services/agentBridgeService'
import * as subagentRepo from '@backend/repositories/subagentRepository'

/**
 * Subagent Completion Persistence Test
 *
 * CRITICAL FIX: The notify() callback fires AFTER the SSE stream ends,
 * so the subagent_complete event never reaches the frontend or DB.
 *
 * Solution: notify() should persist completion to DB directly,
 * not rely on the event queue being consumed.
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

describe('Subagent Completion Persistence', () => {
  let mockSession: ReturnType<typeof createMockSession>
  let sdk: ReturnType<typeof createMockSDK>['sdk']
  let ai: ReturnType<typeof createMockSDK>['ai']
  let sessionId: string

  beforeEach(async () => {
    // Clean up test data
    await prisma.subagent.deleteMany()
    await prisma.message.deleteMany()
    await prisma.session.deleteMany()

    // Create test session
    const session = await prisma.session.create({
      data: {
        id: 'test-session-completion',
        title: 'Test Session',
        status: 'active',
        modelUsed: 'claude-opus-4-6',
      },
    })
    sessionId = session.id

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
    await prisma.subagent.deleteMany()
    await prisma.message.deleteMany()
    await prisma.session.deleteMany()
  })

  it('should persist subagent completion to DB when notify() is called with completion message', async () => {
    // Create a subagent in DB
    const subagent = await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-notify-test-123',
      description: 'Test task',
      tier: 'light',
      status: 'running',
    })

    let capturedUIContext: any = null

    mockSession.bindExtensions.mockImplementation(async (opts: any) => {
      capturedUIContext = opts.uiContext
    })

    mockSession.subscribe.mockImplementation((listener: any) => {
      setTimeout(() => {
        listener({ type: 'agent_start' })
        setTimeout(() => {
          listener({ type: 'agent_end', messages: [] })
        }, 20)
      }, 10)
      return vi.fn()
    })

    mockSession.prompt.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Create agent session (bindExtensions is called here)
    await agentBridge.createSession(sessionId)

    // Ensure capturedUIContext is available
    expect(capturedUIContext).not.toBeNull()

    // Simulate notify() being called AFTER the stream ends
    // This is what happens in production — Sirdar calls notify() after SSE is closed
    capturedUIContext.notify('Agent task-notify-test-123 completed: Test task', 'success')

    // Wait for DB update (async promise chain in notify())
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify DB was updated directly
    const updated = await subagentRepo.getSubagent(subagent.id)
    expect(updated).toBeDefined()
    expect(updated?.status).toBe('completed')
    expect(updated?.completedAt).not.toBeNull()
  })

  it('should persist subagent failure to DB when notify() is called with failure message', async () => {
    // Create a subagent in DB
    const subagent = await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-notify-fail-456',
      description: 'Test task that fails',
      tier: 'standard',
      status: 'running',
    })

    let capturedUIContext: any = null

    mockSession.bindExtensions.mockImplementation(async (opts: any) => {
      capturedUIContext = opts.uiContext
    })

    mockSession.subscribe.mockImplementation((listener: any) => {
      setTimeout(() => {
        listener({ type: 'agent_start' })
        setTimeout(() => {
          listener({ type: 'agent_end', messages: [] })
        }, 20)
      }, 10)
      return vi.fn()
    })

    mockSession.prompt.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Create agent session (bindExtensions is called here)
    await agentBridge.createSession(sessionId)

    // Ensure capturedUIContext is available
    expect(capturedUIContext).not.toBeNull()

    // Simulate notify() being called AFTER the stream ends
    capturedUIContext.notify('Agent task-notify-fail-456 failed: Timeout exceeded', 'error')

    // Wait for DB update (async promise chain in notify())
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify DB was updated directly
    const updated = await subagentRepo.getSubagent(subagent.id)
    expect(updated).toBeDefined()
    expect(updated?.status).toBe('failed')
    expect(updated?.completedAt).not.toBeNull()
  })

  it('should handle notify() called when subagent does not exist in DB (no crash)', async () => {
    let capturedUIContext: any = null

    mockSession.bindExtensions.mockImplementation(async (opts: any) => {
      capturedUIContext = opts.uiContext
    })

    mockSession.subscribe.mockImplementation((listener: any) => {
      setTimeout(() => {
        listener({ type: 'agent_start' })
        setTimeout(() => {
          listener({ type: 'agent_end', messages: [] })
        }, 20)
      }, 10)
      return vi.fn()
    })

    mockSession.prompt.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Create agent session (bindExtensions is called here)
    await agentBridge.createSession(sessionId)

    // Ensure capturedUIContext is available
    expect(capturedUIContext).not.toBeNull()

    // Simulate notify() being called for non-existent task
    // Should not throw
    expect(() => {
      capturedUIContext.notify('Agent task-does-not-exist completed: Ghost task', 'success')
    }).not.toThrow()

    // Wait to ensure no crash
    await new Promise(resolve => setTimeout(resolve, 200))
  })
})
