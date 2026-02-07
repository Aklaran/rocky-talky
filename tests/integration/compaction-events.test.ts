import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { app, resetRateLimiters } from '@backend/app'
import { resetDb, disconnectDb, prisma } from '../setup/db'
import * as agentBridgeService from '@backend/services/agentBridgeService'
import type { AgentEvent } from '@backend/services/agentBridgeService'

/**
 * Compaction Events Integration Tests
 *
 * Tests the full flow of Pi SDK auto-compaction events:
 * - agentBridgeService surfaces compaction_start and compaction_end events
 * - SSE endpoint streams these events to the frontend
 * - compactionCount is incremented in the database
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

describe('Compaction Events', () => {
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

  describe('Compaction Event Streaming', () => {
    it('streams compaction_start and compaction_end events', async () => {
      const session = await prisma.session.create({
        data: { title: null, compactionCount: 0 },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Trigger compaction',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'agent_start' },
        { type: 'text', content: 'Processing...' },
        { type: 'compaction_start', reason: 'threshold' },
        { type: 'compaction_end', aborted: false },
        { type: 'text', content: 'Done!' },
        { type: 'completion', fullText: 'Processing...Done!' },
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

      const compactionStarts = events.filter((e) => e.event === 'compaction_start')
      const compactionEnds = events.filter((e) => e.event === 'compaction_end')

      expect(compactionStarts).toHaveLength(1)
      expect(compactionEnds).toHaveLength(1)

      const startData = compactionStarts[0].data as { reason: string }
      expect(startData.reason).toBe('threshold')

      const endData = compactionEnds[0].data as { aborted: boolean }
      expect(endData.aborted).toBe(false)
    })

    it('increments compactionCount in database on compaction_end', async () => {
      const session = await prisma.session.create({
        data: { title: null, compactionCount: 2 },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Trigger compaction',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'Response' },
        { type: 'compaction_start', reason: 'overflow' },
        { type: 'compaction_end', aborted: false },
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

      // Verify compactionCount was incremented
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
      })

      expect(updatedSession?.compactionCount).toBe(3)
    })

    it('handles compaction_end with error', async () => {
      const session = await prisma.session.create({
        data: { title: null, compactionCount: 0 },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Trigger compaction',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'compaction_start', reason: 'threshold' },
        { type: 'compaction_end', aborted: true, error: 'Compaction failed due to timeout' },
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

      const res = await supertest(app)
        .post('/api/stream/generate')
        .send({ sessionId: session.id })
        .expect(200)

      const events = parseSSEEvents(res.text)
      const compactionEnds = events.filter((e) => e.event === 'compaction_end')

      expect(compactionEnds).toHaveLength(1)

      const endData = compactionEnds[0].data as { aborted: boolean; error?: string }
      expect(endData.aborted).toBe(true)
      expect(endData.error).toBe('Compaction failed due to timeout')

      // Even with error, compactionCount should be incremented
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
      })
      expect(updatedSession?.compactionCount).toBe(1)
    })

    it('handles multiple compactions in one session', async () => {
      const session = await prisma.session.create({
        data: { title: null, compactionCount: 0 },
      })

      await prisma.sessionMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Trigger multiple compactions',
        },
      })

      const mockEvents: AgentEvent[] = [
        { type: 'text', content: 'First...' },
        { type: 'compaction_start', reason: 'threshold' },
        { type: 'compaction_end', aborted: false },
        { type: 'text', content: 'Second...' },
        { type: 'compaction_start', reason: 'overflow' },
        { type: 'compaction_end', aborted: false },
        { type: 'completion', fullText: 'First...Second...' },
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

      // Verify compactionCount was incremented twice
      const updatedSession = await prisma.session.findUnique({
        where: { id: session.id },
      })

      expect(updatedSession?.compactionCount).toBe(2)
    })
  })
})
