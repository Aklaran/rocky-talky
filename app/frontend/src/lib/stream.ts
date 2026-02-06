import type { StreamEvent } from '@shared/schemas/ai'

/**
 * SSE client for AI response streaming.
 *
 * Uses fetch + ReadableStream (not EventSource) because:
 * - We need POST (EventSource only supports GET)
 * - Better error handling
 * - Works with the session cookie automatically
 *
 * Usage:
 *   for await (const event of streamAIResponse(conversationId)) {
 *     if (event.type === 'chunk') updateText(event.content)
 *     if (event.type === 'done') handleComplete(event.message)
 *     if (event.type === 'error') handleError(event.error)
 *   }
 */

/**
 * Stream AI response for a conversation.
 * Yields parsed SSE events as they arrive.
 */
export async function* streamAIResponse(
  conversationId: string,
): AsyncGenerator<StreamEvent> {
  const response = await fetch('/api/chat/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
    credentials: 'include', // Send session cookie
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    yield {
      type: 'error' as const,
      error: body.error || `HTTP ${response.status}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error' as const, error: 'No response body' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer
      const events = parseSSEBuffer(buffer)
      buffer = events.remaining

      for (const event of events.parsed) {
        yield event
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const events = parseSSEBuffer(buffer + '\n\n')
      for (const event of events.parsed) {
        yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse SSE events from a buffer string.
 * Returns parsed events and any remaining unparsed text.
 */
function parseSSEBuffer(buffer: string): {
  parsed: StreamEvent[]
  remaining: string
} {
  const parsed: StreamEvent[] = []
  const blocks = buffer.split('\n\n')
  const remaining = blocks.pop() || '' // Last element may be incomplete

  for (const block of blocks) {
    if (!block.trim()) continue

    let eventType = ''
    let data = ''

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7)
      } else if (line.startsWith('data: ')) {
        data = line.slice(6)
      }
    }

    if (!eventType || !data) continue

    try {
      const payload = JSON.parse(data)

      switch (eventType) {
        case 'chunk':
          parsed.push({ type: 'chunk', content: payload.content })
          break
        case 'done':
          parsed.push({ type: 'done', message: payload.message })
          break
        case 'error':
          parsed.push({ type: 'error', error: payload.error })
          break
      }
    } catch {
      // Skip malformed events
    }
  }

  return { parsed, remaining }
}
