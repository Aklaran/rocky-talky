import { useState, useCallback, useRef, useEffect } from 'react'
import { trpc } from './trpc'

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

export interface SubagentInfo {
  toolCallId: string
  taskId: string | null
  description: string
  tier: string
  status: 'spawning' | 'running' | 'completed' | 'failed'
  outputLines: string[]
}

export interface UseAgentStreamReturn {
  streamingText: string
  isStreaming: boolean
  isCompacting: boolean
  activeTools: ToolCall[]
  subagents: SubagentInfo[]
  error: string | null
  sendAndStream: (sessionId: string) => Promise<void>
}

export function useAgentStream(): UseAgentStreamReturn {
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [activeTools, setActiveTools] = useState<ToolCall[]>([])
  const [subagents, setSubagents] = useState<SubagentInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentSessionIdRef = useRef<string | null>(null)

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [])

  /**
   * Start polling for subagent status updates.
   * Called when stream ends with running/spawning subagents.
   */
  const startPolling = useCallback((sessionId: string) => {
    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    const pollSubagents = async () => {
      try {
        const backendSubagents = await trpc.session.subagents.query({ sessionId })
        
        // Update subagent state with backend data
        setSubagents(prevSubagents => {
          return prevSubagents.map(subagent => {
            const backendSubagent = backendSubagents.find(
              bs => bs.taskId === subagent.taskId
            )
            if (backendSubagent) {
              return {
                ...subagent,
                status: backendSubagent.status as SubagentInfo['status'],
              }
            }
            return subagent
          })
        })

        // Check if all subagents are done
        const allDone = backendSubagents.every(
          s => s.status === 'completed' || s.status === 'failed'
        )

        if (allDone && pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      } catch (err) {
        console.error('Failed to poll subagent status:', err)
      }
    }

    // Start polling every 3 seconds
    pollingIntervalRef.current = setInterval(pollSubagents, 3000)
  }, [])

  /**
   * Stop polling for subagent updates.
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  const sendAndStream = useCallback(async (sessionId: string) => {
    // Reset state
    setStreamingText('')
    setIsStreaming(true)
    setIsCompacting(false)
    setActiveTools([])
    setSubagents([])
    setError(null)
    currentSessionIdRef.current = sessionId

    // Stop any existing polling
    stopPolling()

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

        let currentEvent = ''
        for (const line of lines) {
          if (!line.trim()) {
            currentEvent = ''
            continue
          }

          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data) continue

            try {
              const parsed = JSON.parse(data)
              handleSSEEvent(currentEvent, parsed)
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
      
      // If we got partial text before the error, this is a mid-stream disconnect.
      // The backend has already saved the partial response to the DB.
      // Don't show error - just stop streaming and leave the partial text visible.
      if (streamingText) {
        console.warn('Stream disconnected mid-response, partial text preserved:', streamingText.length, 'chars')
        // Don't set error - the partial text is still valid and saved server-side
      } else {
        // No text received at all - this is a total failure
        console.error('Stream error:', err)
        setError(err instanceof Error ? err.message : 'Stream failed')
      }
    } finally {
      setIsStreaming(false)
    }
  }, [stopPolling, startPolling])

  function handleSSEEvent(eventType: string, data: any) {
    switch (eventType) {
      case 'text':
        setStreamingText((prev) => prev + data.content)
        break
      case 'tool_start':
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
        break
      case 'tool_end':
        setActiveTools((prev) =>
          prev.map((tool) =>
            tool.toolCallId === data.toolCallId
              ? { ...tool, isComplete: true, isError: data.isError }
              : tool
          )
        )
        break
      case 'subagent_spawn':
        setSubagents((prev) => [
          ...prev,
          {
            toolCallId: data.toolCallId,
            taskId: null,
            description: data.description,
            tier: data.tier,
            status: 'spawning',
            outputLines: [],
          },
        ])
        break
      case 'subagent_result':
        setSubagents((prev) =>
          prev.map((subagent) =>
            subagent.toolCallId === data.toolCallId
              ? { ...subagent, taskId: data.taskId, status: data.status }
              : subagent
          )
        )
        break
      case 'subagent_output':
        setSubagents((prev) => {
          // Find the most recent subagent (the one currently outputting)
          if (prev.length === 0) return prev
          const lastIndex = prev.length - 1
          const updated = [...prev]
          updated[lastIndex] = {
            ...updated[lastIndex],
            outputLines: data.lines,
          }
          return updated
        })
        break
      case 'subagent_complete':
        setSubagents((prev) =>
          prev.map((subagent) =>
            subagent.taskId === data.taskId
              ? { ...subagent, status: data.success ? 'completed' : 'failed' }
              : subagent
          )
        )
        break
      case 'done':
        setStreamingText('')
        setActiveTools([])
        setIsStreaming(false)
        
        // Check if any subagents are still running/spawning
        // If so, start polling for status updates
        setSubagents(prevSubagents => {
          const hasRunningSubagents = prevSubagents.some(
            s => s.status === 'running' || s.status === 'spawning'
          )
          
          if (hasRunningSubagents && currentSessionIdRef.current) {
            startPolling(currentSessionIdRef.current)
          }
          
          return prevSubagents
        })
        break
      case 'error':
        setError(data.error)
        setIsStreaming(false)
        break
      case 'compaction_start':
        setIsCompacting(true)
        break
      case 'compaction_end':
        setIsCompacting(false)
        break
    }
  }

  return {
    streamingText,
    isStreaming,
    isCompacting,
    activeTools,
    subagents,
    error,
    sendAndStream,
  }
}
