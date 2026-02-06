import { describe, it, expect, beforeEach } from 'vitest'
import { MockProvider } from '@backend/services/providers/mock'
import type { AIMessage } from '@shared/schemas/ai'

/**
 * AI service unit tests.
 *
 * Tests the provider abstraction layer using the MockProvider.
 * No network calls, no database — pure unit tests.
 *
 * Key behaviors tested:
 * - Provider interface contract (chat, chatStream)
 * - Mock provider returns expected content
 * - Stream yields chunks that reconstruct the full response
 * - Provider tracks calls for test assertions
 * - Custom mock responses
 */

describe('MockProvider', () => {
  let provider: MockProvider
  const messages: AIMessage[] = [
    { role: 'user', content: 'Hello, world!' },
  ]

  beforeEach(() => {
    provider = new MockProvider()
  })

  describe('chat()', () => {
    it('returns a response referencing the last user message', async () => {
      const result = await provider.chat(messages)
      expect(result).toBe('Mock response to: "Hello, world!"')
    })

    it('tracks calls for test assertions', async () => {
      await provider.chat(messages)
      expect(provider.calls).toHaveLength(1)
      expect(provider.calls[0].messages).toEqual(messages)
    })

    it('uses custom mock response when set', async () => {
      provider.mockResponse = 'Custom AI output'
      const result = await provider.chat(messages)
      expect(result).toBe('Custom AI output')
    })

    it('handles multi-turn conversations', async () => {
      const multiTurn: AIMessage[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'What is 2+2?' },
      ]
      const result = await provider.chat(multiTurn)
      expect(result).toBe('Mock response to: "What is 2+2?"')
    })

    it('handles no user messages gracefully', async () => {
      const systemOnly: AIMessage[] = [
        { role: 'system', content: 'You are helpful.' },
      ]
      const result = await provider.chat(systemOnly)
      expect(result).toBe('Mock response to: "unknown"')
    })

    it('passes options through', async () => {
      await provider.chat(messages, { temperature: 0.5, maxTokens: 100 })
      expect(provider.calls[0].options).toEqual({ temperature: 0.5, maxTokens: 100 })
    })
  })

  describe('chatStream()', () => {
    it('yields chunks that reconstruct the full response', async () => {
      const chunks: string[] = []
      for await (const chunk of provider.chatStream(messages)) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBeGreaterThan(0)
      const fullResponse = chunks.join('')
      expect(fullResponse.trim()).toBe('Mock response to: "Hello, world!"')
    })

    it('tracks stream calls', async () => {
      // Consume the stream
      for await (const _ of provider.chatStream(messages)) {
        // drain
      }
      expect(provider.calls).toHaveLength(1)
    })

    it('streams custom mock response', async () => {
      provider.mockResponse = 'Short reply'
      const chunks: string[] = []
      for await (const chunk of provider.chatStream(messages)) {
        chunks.push(chunk)
      }
      expect(chunks.join('').trim()).toBe('Short reply')
    })
  })

  describe('reset()', () => {
    it('clears tracked calls and custom response', async () => {
      provider.mockResponse = 'Custom'
      await provider.chat(messages)

      expect(provider.calls).toHaveLength(1)
      expect(provider.mockResponse).toBe('Custom')

      provider.reset()

      expect(provider.calls).toHaveLength(0)
      expect(provider.mockResponse).toBeNull()
    })
  })
})
