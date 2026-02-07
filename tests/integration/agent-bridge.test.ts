import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest'
import * as agentBridge from '@backend/services/agentBridgeService'

/**
 * Agent Bridge Integration Tests
 *
 * These tests validate the agent bridge service can:
 * - Create Pi agent sessions
 * - Send messages and receive events
 * - Stream text deltas
 * - Handle tool calls
 * - Clean up sessions properly
 *
 * Note: These tests make REAL API calls to the Anthropic API via the Pi SDK.
 * They require:
 * - Valid API keys in ~/.pi/agent/auth.json
 * - Annapurna skill at ~/.pi/agent/skills/annapurna/SKILL.md
 * - Network connectivity
 *
 * Run selectively to avoid API costs: pnpm test agent-bridge
 */

describe('Agent Bridge Service', () => {
  beforeEach(async () => {
    // Clean up any lingering sessions before each test
    await agentBridge.disposeAllSessions()
  })

  afterEach(async () => {
    // Clean up after each test
    await agentBridge.disposeAllSessions()
  })

  describe('Session Management', () => {
    it('creates a new agent session', async () => {
      const sessionId = 'test-session-1'

      const sessionInfo = await agentBridge.createSession(sessionId)

      expect(sessionInfo).toBeDefined()
      expect(sessionInfo.sessionId).toBe(sessionId)
      expect(sessionInfo.piSession).toBeDefined()
      expect(sessionInfo.createdAt).toBeInstanceOf(Date)
    })

    it('throws error when creating duplicate session', async () => {
      const sessionId = 'test-session-2'

      await agentBridge.createSession(sessionId)

      await expect(agentBridge.createSession(sessionId)).rejects.toThrow(
        /already exists/,
      )
    })

    it('retrieves existing session', async () => {
      const sessionId = 'test-session-3'

      await agentBridge.createSession(sessionId)
      const retrieved = agentBridge.getSession(sessionId)

      expect(retrieved).toBeDefined()
      expect(retrieved?.sessionId).toBe(sessionId)
    })

    it('returns null for non-existent session', () => {
      const retrieved = agentBridge.getSession('non-existent')

      expect(retrieved).toBeNull()
    })

    it('disposes a session successfully', async () => {
      const sessionId = 'test-session-4'

      await agentBridge.createSession(sessionId)
      const disposed = await agentBridge.disposeSession(sessionId)

      expect(disposed).toBe(true)

      const retrieved = agentBridge.getSession(sessionId)
      expect(retrieved).toBeNull()
    })

    it('returns false when disposing non-existent session', async () => {
      const disposed = await agentBridge.disposeSession('non-existent')

      expect(disposed).toBe(false)
    })

    it('tracks active session count', async () => {
      const initialCount = agentBridge.getActiveSessionCount()
      expect(initialCount).toBe(0)

      await agentBridge.createSession('session-1')
      expect(agentBridge.getActiveSessionCount()).toBe(1)

      await agentBridge.createSession('session-2')
      expect(agentBridge.getActiveSessionCount()).toBe(2)

      await agentBridge.disposeSession('session-1')
      expect(agentBridge.getActiveSessionCount()).toBe(1)

      await agentBridge.disposeAllSessions()
      expect(agentBridge.getActiveSessionCount()).toBe(0)
    })
  })

  describe('Message Handling', () => {
    it('sends a message and receives events', async () => {
      const sessionId = 'test-message-1'

      await agentBridge.createSession(sessionId)

      const message = 'Hello, test message'
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage(sessionId, message)) {
        events.push(event)
      }

      // Should receive at least some events (exact count depends on SDK)
      expect(events.length).toBeGreaterThan(0)

      // Should include a completion event
      const completionEvents = events.filter((e) => e.type === 'completion')
      expect(completionEvents.length).toBeGreaterThan(0)

      // Completion should have accumulated text
      const completion = completionEvents[0] as agentBridge.AgentEventCompletion
      expect(completion.fullText).toBeDefined()
      expect(typeof completion.fullText).toBe('string')
    }, 60000) // Increase timeout for actual API call

    it('includes text delta events', async () => {
      const sessionId = 'test-message-2'

      await agentBridge.createSession(sessionId)

      const message = 'Say hello'
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage(sessionId, message)) {
        events.push(event)
      }

      const textEvents = events.filter((e) => e.type === 'text')

      // Should receive text chunks (streaming)
      expect(textEvents.length).toBeGreaterThan(0)

      // Each text event should have content
      textEvents.forEach((event) => {
        const textEvent = event as agentBridge.AgentEventChunk
        expect(textEvent.content).toBeDefined()
        expect(typeof textEvent.content).toBe('string')
      })
    }, 60000)

    it('throws error when sending to non-existent session', async () => {
      await expect(
        (async () => {
          for await (const event of agentBridge.sendMessage(
            'non-existent',
            'test',
          )) {
            // Should not reach here
          }
        })(),
      ).rejects.toThrow(/No agent session found/)
    })
  })

  describe('Tool Call Detection', () => {
    it('detects tool calls when they occur', async () => {
      const sessionId = 'test-tools-1'

      await agentBridge.createSession(sessionId)

      // Ask for something that requires a tool call
      const message = 'What is the current date and time?'
      const events: agentBridge.AgentEvent[] = []

      for await (const event of agentBridge.sendMessage(sessionId, message)) {
        events.push(event)
      }

      // May or may not have tool calls depending on the model's behavior
      // Just verify we can handle tool call events if they occur
      const toolCallEvents = events.filter((e) => e.type === 'tool_call')

      toolCallEvents.forEach((event) => {
        const toolEvent = event as agentBridge.AgentEventToolCall
        expect(toolEvent.toolName).toBeDefined()
        expect(typeof toolEvent.toolName).toBe('string')
      })
    }, 60000)
  })

  describe('Cleanup', () => {
    it('disposes all sessions at once', async () => {
      await agentBridge.createSession('cleanup-1')
      await agentBridge.createSession('cleanup-2')
      await agentBridge.createSession('cleanup-3')

      expect(agentBridge.getActiveSessionCount()).toBe(3)

      await agentBridge.disposeAllSessions()

      expect(agentBridge.getActiveSessionCount()).toBe(0)
    })
  })
})
