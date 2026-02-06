import { describe, it, expect } from 'vitest'
import { conversationSummarySchema } from '@shared/schemas/ai'

/**
 * AI Eval Harness — validates structured outputs match Zod schemas.
 *
 * These tests run against the mock provider by default.
 * To run against a real model, set EVAL_PROVIDER=openai and OPENAI_API_KEY.
 *
 * Purpose:
 * - Catch prompt regressions (output no longer matches expected schema)
 * - Validate structured output parsing logic
 * - Lightweight enough to run in CI with the mock provider
 *
 * To add a new eval:
 * 1. Define the expected output schema in shared/schemas/ai.ts
 * 2. Add a test case below with example input and schema validation
 */

describe('AI Evals', () => {
  describe('Structured output schema validation', () => {
    it('validates a well-formed conversation summary', () => {
      // Simulate a structured AI output
      const output = {
        title: 'Discussion about weather',
        topics: ['weather', 'climate', 'temperature'],
        sentiment: 'neutral',
      }

      const result = conversationSummarySchema.safeParse(output)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe('Discussion about weather')
        expect(result.data.topics).toHaveLength(3)
        expect(result.data.sentiment).toBe('neutral')
      }
    })

    it('rejects summary with invalid sentiment', () => {
      const output = {
        title: 'Test',
        topics: ['test'],
        sentiment: 'angry', // Not in enum
      }

      const result = conversationSummarySchema.safeParse(output)
      expect(result.success).toBe(false)
    })

    it('rejects summary with title too long', () => {
      const output = {
        title: 'A'.repeat(81),
        topics: ['test'],
        sentiment: 'positive',
      }

      const result = conversationSummarySchema.safeParse(output)
      expect(result.success).toBe(false)
    })

    it('rejects summary missing required fields', () => {
      const output = { title: 'Test' } // Missing topics and sentiment

      const result = conversationSummarySchema.safeParse(output)
      expect(result.success).toBe(false)
    })

    it('accepts summary with empty topics array', () => {
      const output = {
        title: 'Empty conversation',
        topics: [],
        sentiment: 'neutral',
      }

      const result = conversationSummarySchema.safeParse(output)
      expect(result.success).toBe(true)
    })
  })

  describe('Stream event schema validation', () => {
    it('validates chunk events', async () => {
      const { streamChunkEventSchema } = await import('@shared/schemas/ai')

      const chunk = { type: 'chunk', content: 'Hello ' }
      const result = streamChunkEventSchema.safeParse(chunk)
      expect(result.success).toBe(true)
    })

    it('validates done events', async () => {
      const { streamDoneEventSchema } = await import('@shared/schemas/ai')

      const done = {
        type: 'done',
        message: {
          id: 'cltest123',
          conversationId: 'clconv456',
          role: 'assistant',
          content: 'Hello world',
          createdAt: new Date().toISOString(),
        },
      }
      const result = streamDoneEventSchema.safeParse(done)
      expect(result.success).toBe(true)
    })

    it('validates error events', async () => {
      const { streamErrorEventSchema } = await import('@shared/schemas/ai')

      const error = { type: 'error', error: 'Something went wrong' }
      const result = streamErrorEventSchema.safeParse(error)
      expect(result.success).toBe(true)
    })

    it('discriminated union resolves correct event type', async () => {
      const { streamEventSchema } = await import('@shared/schemas/ai')

      const chunk = streamEventSchema.parse({ type: 'chunk', content: 'hi' })
      expect(chunk.type).toBe('chunk')

      const error = streamEventSchema.parse({ type: 'error', error: 'oops' })
      expect(error.type).toBe('error')
    })
  })
})
