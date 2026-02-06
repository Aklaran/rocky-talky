import type { AIProvider } from '../aiService'
import type { AIMessage, ChatOptions } from '@shared/schemas/ai'

/**
 * Mock AI provider — returns deterministic responses for testing.
 *
 * Used when:
 * - AI_PROVIDER=mock (explicit)
 * - Running tests (set in .env.test)
 * - Developing without API keys
 *
 * The mock response includes the user's last message so tests can verify
 * the conversation history was passed correctly.
 */

const MOCK_DELAY_MS = 10 // Simulate a tiny delay per chunk

export class MockProvider implements AIProvider {
  readonly name = 'mock'

  /** Configurable response for testing — set before calling chat/chatStream */
  public mockResponse: string | null = null

  /** Track calls for test assertions */
  public calls: { messages: AIMessage[]; options?: ChatOptions }[] = []

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    this.calls.push({ messages, options })
    return this.getResponse(messages)
  }

  async *chatStream(messages: AIMessage[], options?: ChatOptions): AsyncGenerator<string> {
    this.calls.push({ messages, options })
    const response = this.getResponse(messages)
    const words = response.split(' ')

    for (const word of words) {
      await delay(MOCK_DELAY_MS)
      yield word + ' '
    }
  }

  /**
   * Reset tracked calls — use between tests.
   */
  reset(): void {
    this.calls = []
    this.mockResponse = null
  }

  private getResponse(messages: AIMessage[]): string {
    if (this.mockResponse) return this.mockResponse

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    return `Mock response to: "${lastUserMessage?.content ?? 'unknown'}"`
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
