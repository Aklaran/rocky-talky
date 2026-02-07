import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { app, resetRateLimiters } from '@backend/app'
import { resetDb, disconnectDb, prisma } from '../setup/db'
import { createAuthenticatedCaller } from '../setup/trpc'
import * as agentBridgeService from '@backend/services/agentBridgeService'
import type { AgentEvent } from '@backend/services/agentBridgeService'

/**
 * SSE Streaming Integration Tests — Pi SDK Agent Bridge
 *
 * Tests the full flow:
 * - Send user message via tRPC
 * - Stream AI response via SSE endpoint (powered by Pi SDK agent)
 * - Verify assistant message saved to DB
 * - Verify auto-titling after first AI response
 *
 * Uses mocked agentBridgeService (no real Pi SDK calls).
 *
 * Key behaviors tested:
 * - SSE endpoint streams text, tool_start, tool_end events
 * - Complete assistant message saved to DB
 * - Auto-titling from first user message
 * - Error handling (non-existent session, no user message)
 * - Tool call events (spawn_agent, Read, etc.)
 *
 * NOTE (Rocky Talky): No auth checks — Tailscale is the auth layer.
 */

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse SSE response body into events.
 */
function parseSSEEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = []
  const blocks = body.split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue

    let eventType = ''
    let data = ''

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7)
      else if (line.startsWith('data: ')) data = line.slice(6)
    }

    if (eventType && data) {
      try {
        events.push({ event: eventType, data: JSON.parse(data) })
      } catch {
        // skip malformed
      }
    }
  }

  return events
}

/**
 * Create a mock async generator that yields agent events.
 */
async function* mockAgentEventStream(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  for (const event of events) {
    yield event
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('SSE Streaming (/api/stream/generate)', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>
  let mockCreateSession: ReturnType<typeof vi.fn>
  let mockGetSession: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    await resetDb()
    resetRateLimiters()

    // Mock agentBridgeService
    mockSendMessage = vi.fn()
    mockCreateSession = vi.fn()
    mockGetSession = vi.fn()

    vi.spyOn(agentBridgeService, 'sendMessage').mockImplementation(mockSendMessage)
    vi.spyOn(agentBridgeService, 'createSession').mockImplementation(mockCreateSession)
    vi.spyOn(agentBridgeService, 'getSession').mockImplementation(mockGetSession)
  })

  afterAll(async () => {
    await disconnectDb()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // Streaming — Happy Path
  // ===========================================================================

  describe('Streaming', () => {
    it('streams AI response and saves assistant message', async () => {
      // Create a session and send a user message
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Hello AI!',
        },
      })

      // Mock agent bridge to return a simple text response
      const mockEvents: AgentEvent[] = [
        { type: 'agent_start' },
        { type: 'text', content: 'Hello' },
        { type: 'text', content: ' there!' },
        { type: 'completion', fullText: 'Hello there!' },
        { type: 'agent_end' },
      ]

      mockGetSession.mockReturnValue(null) // No existing agent session
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      // Stream the AI response
      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('text/event-stream')

      // Parse SSE events
      const events = parseSSEEvents(res.text)

      // Should have text events and a done event
      const textEvents = events.filter((e) => e.event === 'text')
      const doneEvents = events.filter((e) => e.event === 'done')

      expect(textEvents.length).toBe(2)
      expect(doneEvents).toHaveLength(1)

      // Text events should have content
      expect((textEvents[0].data as { content: string }).content).toBe('Hello')
      expect((textEvents[1].data as { content: string }).content).toBe(' there!')

      // Done event should have the saved message
      const doneData = doneEvents[0].data as {
        message: { id: string; role: string; content: string }
      }
      expect(doneData.message.id).toBeDefined()
      expect(doneData.message.role).toBe('assistant')
      expect(doneData.message.content).toBe('Hello there!')

      // Verify the message was saved to DB
      const savedMsg = await prisma.sessionMessage.findUnique({
        where: { id: doneData.message.id },
      })
      expect(savedMsg).not.toBeNull()
      expect(savedMsg?.role).toBe('assistant')
      expect(savedMsg?.content).toBe('Hello there!')
    })

    it('uses existing agent session if available', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Second message',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'Response' },
        { type: 'completion', fullText: 'Response' },
      ]

      // Mock existing agent session
      mockGetSession.mockReturnValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      // Should NOT have called createSession
      expect(mockCreateSession).not.toHaveBeenCalled()
      // Should have used existing session
      expect(mockSendMessage).toHaveBeenCalledWith(session.id, 'Second message')
    })

    it('auto-titles session after first AI response', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'This is a long message that should be truncated for the title',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'Response' },
        { type: 'completion', fullText: 'Response' },
      ]

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      // Verify session was auto-titled
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
      })

      expect(updatedSession?.title).toBe('This is a long message that should be truncated fo…')
      expect(updatedSession?.title?.length).toBeLessThanOrEqual(51) // 50 chars + ellipsis
    })

    it('does not auto-title if session already has a title', async () => {
      const session = await prisma.session.create({
        data: { title: 'Existing Title' },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Hello',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'Response' },
        { type: 'completion', fullText: 'Response' },
      ]

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      // Title should remain unchanged
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
      })

      expect(updatedSession?.title).toBe('Existing Title')
    })
  })

  // ===========================================================================
  // Tool Calls
  // ===========================================================================

  describe('Tool Calls', () => {
    it('streams tool_start and tool_end events', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Read a file',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'agent_start' },
        { type: 'text', content: 'Let me read that file...' },
        {
          type: 'tool_start',
          toolCallId: 'call-1',
          toolName: 'Read',
          args: { path: '/tmp/test.txt' },
        },
        {
          type: 'tool_end',
          toolCallId: 'call-1',
          toolName: 'Read',
          isError: false,
        },
        { type: 'text', content: 'Done!' },
        { type: 'completion', fullText: 'Let me read that file...Done!' },
        { type: 'agent_end' },
      ]

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      const events = parseSSEEvents(res.text)

      const toolStarts = events.filter((e) => e.event === 'tool_start')
      const toolEnds = events.filter((e) => e.event === 'tool_end')

      expect(toolStarts).toHaveLength(1)
      expect(toolEnds).toHaveLength(1)

      const toolStart = toolStarts[0].data as {
        toolCallId: string
        toolName: string
        args: { path: string }
      }
      expect(toolStart.toolName).toBe('Read')
      expect(toolStart.toolCallId).toBe('call-1')
      expect(toolStart.args.path).toBe('/tmp/test.txt')

      const toolEnd = toolEnds[0].data as {
        toolCallId: string
        toolName: string
        isError: boolean
      }
      expect(toolEnd.toolName).toBe('Read')
      expect(toolEnd.isError).toBe(false)
    })

    it('handles subagent spawning events', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Spawn a subagent',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'Spawning subagent...' },
        {
          type: 'tool_start',
          toolCallId: 'call-spawn-1',
          toolName: 'spawn_agent',
          args: { description: 'Test task', prompt: 'Do something', tier: 'light' },
        },
        {
          type: 'tool_end',
          toolCallId: 'call-spawn-1',
          toolName: 'spawn_agent',
          isError: false,
        },
        { type: 'text', content: 'Done!' },
        { type: 'completion', fullText: 'Spawning subagent...Done!' },
      ]

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      const events = parseSSEEvents(res.text)
      const toolStarts = events.filter((e) => e.event === 'tool_start')

      expect(toolStarts).toHaveLength(1)

      const toolStart = toolStarts[0].data as {
        toolName: string
        args: { description: string; tier: string }
      }
      expect(toolStart.toolName).toBe('spawn_agent')
      expect(toolStart.args.description).toBe('Test task')
    })
  })

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('returns 404 for non-existent session', async () => {
      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Session not found')
    })

    it('returns 400 when no user message found', async () => {
      const session = await prisma.session.create({
        data: { title: 'Empty Session' },
      })

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No user message found in session')
    })

    it('validates request body', async () => {
      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })

    it('streams error event when agent returns error', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Trigger error',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'Starting...' },
        { type: 'error', error: 'API rate limit exceeded' },
      ]

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      const events = parseSSEEvents(res.text)
      const errorEvents = events.filter((e) => e.event === 'error')

      expect(errorEvents).toHaveLength(1)
      expect((errorEvents[0].data as { error: string }).error).toBe('API rate limit exceeded')
    })

    it('handles agent throwing exception', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Cause exception',
        },
      })

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockImplementation(() => {
        throw new Error('Unexpected agent error')
      })

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      const events = parseSSEEvents(res.text)
      const errorEvents = events.filter((e) => e.event === 'error')

      expect(errorEvents).toHaveLength(1)
      expect((errorEvents[0].data as { error: string }).error).toBe('Failed to generate response')
    })
  })

  // ===========================================================================
  // Safety Limits
  // ===========================================================================

  describe('Safety Limits', () => {
    it('stops streaming when response exceeds max length', async () => {
      const session = await prisma.session.create({
        data: { title: null },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Generate lots of text',
        },
      })

      // Generate events that exceed MAX_RESPONSE_LENGTH (100k chars)
      const longText = 'x'.repeat(50000)
      const mockEvents: AgentEvent[] = [
        { type: 'text', content: longText },
        { type: 'text', content: longText },
        { type: 'text', content: longText }, // This would exceed 100k
        { type: 'completion', fullText: longText + longText + longText },
      ]

      mockGetSession.mockReturnValue(null)
      mockCreateSession.mockResolvedValue({
        sessionId: session.id,
        piSession: {},
        createdAt: new Date(),
      })
      mockSendMessage.mockReturnValue(mockAgentEventStream(mockEvents))

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      const events = parseSSEEvents(res.text)
      const errorEvents = events.filter((e) => e.event === 'error')

      // Should have stopped with error
      expect(errorEvents.length).toBeGreaterThan(0)
      expect((errorEvents[0].data as { error: string }).error).toBe('Response too long')
    })
  })
})
