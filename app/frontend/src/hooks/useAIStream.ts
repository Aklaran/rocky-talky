import { useState, useCallback, useRef } from 'react'
import { streamAIResponse } from '@/lib/stream'
import type { StreamDoneEvent } from '@shared/schemas/ai'

/**
 * Hook for managing AI response streaming state.
 *
 * Handles:
 * - Streaming text accumulation
 * - Loading/error states
 * - Cleanup on unmount or new request
 *
 * Usage:
 *   const { streamingContent, isStreaming, error, generate } = useAIStream()
 *   // After sending a user message:
 *   generate(conversationId, { onComplete: () => refetchConversation() })
 */

interface UseAIStreamOptions {
  onComplete?: (event: StreamDoneEvent) => void
  onError?: (error: string) => void
}

export function useAIStream() {
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  const generate = useCallback(
    async (conversationId: string, options?: UseAIStreamOptions) => {
      // Reset state
      abortRef.current = false
      setStreamingContent('')
      setIsStreaming(true)
      setError(null)

      try {
        for await (const event of streamAIResponse(conversationId)) {
          if (abortRef.current) break

          switch (event.type) {
            case 'chunk':
              setStreamingContent((prev) => prev + event.content)
              break
            case 'done':
              setIsStreaming(false)
              setStreamingContent('')
              options?.onComplete?.(event)
              return
            case 'error':
              setIsStreaming(false)
              setError(event.error)
              options?.onError?.(event.error)
              return
          }
        }

        // Stream ended without done/error event
        setIsStreaming(false)
      } catch (err) {
        setIsStreaming(false)
        const msg = err instanceof Error ? err.message : 'Stream failed'
        setError(msg)
        options?.onError?.(msg)
      }
    },
    [],
  )

  const abort = useCallback(() => {
    abortRef.current = true
    setIsStreaming(false)
  }, [])

  return {
    streamingContent,
    isStreaming,
    error,
    generate,
    abort,
  }
}
