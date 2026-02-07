import { useState, useCallback, useRef } from 'react'

/**
 * useAgentStream — handles SSE streaming from the backend.
 *
 * Flow:
 * 1. POST to /api/stream/generate with { sessionId }
 * 2. Parse SSE events from the response
 * 3. Update state based on event type (text, tool_start, tool_end, done, error)
 * 4. Clean up on done/error
 */

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: unknown
  isComplete: boolean
  isError: boolean
}

export interface UseAgentStreamReturn {
  streamingText: string
  isStreaming: boolean
  activeTools: ToolCall[]
  error: string | null
  sendAndStream: (sessionId: string) => Promise<void>
}

export function useAgentStream(): UseAgentStreamReturn {
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeTools, setActiveTools] = useState<ToolCall[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendAndStream = useCallback(async (sessionId: string) => {
    // Reset state
    setStreamingText('')
    setIsStreaming(true)
    setActiveTools([])
    setError(null)

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/stream/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      // Parse SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          if (line.startsWith('event: ')) {
            // Event type is in the line, but we determine type from data shape
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data) continue

            try {
              const parsed = JSON.parse(data)
              handleSSEEvent(parsed)
            } catch (e) {
              console.error('Failed to parse SSE data:', data, e)
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Stream was aborted, not an error
        return
      }
      console.error('Stream error:', err)
      setError(err instanceof Error ? err.message : 'Stream failed')
    } finally {
      setIsStreaming(false)
    }
  }, [])

  function handleSSEEvent(data: any) {
    // Determine event type from data shape
    if ('content' in data) {
      // text event
      setStreamingText((prev) => prev + data.content)
    } else if ('toolCallId' in data && 'toolName' in data && 'args' in data) {
      // tool_start event
      setActiveTools((prev) => [
        ...prev,
        {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          args: data.args,
          isComplete: false,
          isError: false,
        },
      ])
    } else if ('toolCallId' in data && 'isError' in data) {
      // tool_end event
      setActiveTools((prev) =>
        prev.map((tool) =>
          tool.toolCallId === data.toolCallId
            ? { ...tool, isComplete: true, isError: data.isError }
            : tool
        )
      )
    } else if ('message' in data) {
      // done event
      setStreamingText('')
      setActiveTools([])
      setIsStreaming(false)
    } else if ('error' in data) {
      // error event
      setError(data.error)
      setIsStreaming(false)
    }
  }

  return {
    streamingText,
    isStreaming,
    activeTools,
    error,
    sendAndStream,
  }
}
