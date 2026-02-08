import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAgentStream } from './useAgentStream'

/**
 * useAgentStream tests — verifies SSE event handling and state management.
 * 
 * Tests subagent lifecycle:
 * 1. subagent_spawn → adds subagent with status 'spawning'
 * 2. subagent_result → updates to 'running' with taskId
 * 3. subagent_output → appends output lines
 * 4. subagent_complete → updates status to 'completed' or 'failed'
 * 5. POLL after stream ends → fetches subagent status from backend
 */

// Mock tRPC client - use factory function to avoid hoisting issues
vi.mock('./trpc', () => {
  const mockQuery = vi.fn()
  return {
    trpc: {
      session: {
        subagents: {
          query: mockQuery,
        },
      },
    },
  }
})

// Import after vi.mock
import { trpc } from './trpc'

describe('useAgentStream - subagent tracking', () => {
  beforeEach(() => {
    // Mock fetch for SSE streaming
    global.fetch = vi.fn()
  })

  it('should initialize with empty subagents array', () => {
    const { result } = renderHook(() => useAgentStream())
    expect(result.current.subagents).toEqual([])
  })

  it('should add subagent on subagent_spawn event', async () => {
    // Create a mock SSE stream that sends events properly
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        // Send subagent_spawn event with proper SSE format
        const event = 'event: subagent_spawn\ndata: {"toolCallId":"tool-123","description":"Test task","tier":"light"}\n\n'
        controller.enqueue(encoder.encode(event))
        
        // Send done event to close the stream
        const doneEvent = 'event: done\ndata: {}\n\n'
        controller.enqueue(encoder.encode(doneEvent))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.subagents).toHaveLength(1)
    }, { timeout: 2000 })
    
    expect(result.current.subagents[0]).toMatchObject({
      toolCallId: 'tool-123',
      description: 'Test task',
      tier: 'light',
      status: 'spawning',
      taskId: null,
      outputLines: [],
    })
  })

  it('should update subagent on subagent_result event', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        // First spawn the subagent
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-123","description":"Test task","tier":"light"}\n\n'))
        // Then send result event (when spawn_agent tool completes)
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-123","taskId":"task-456","status":"running"}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.subagents).toHaveLength(1)
      expect(result.current.subagents[0].taskId).toBe('task-456')
      expect(result.current.subagents[0].status).toBe('running')
    })
  })

  it('should append output lines on subagent_output event', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-123","description":"Test task","tier":"light"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-123","taskId":"task-456","status":"running"}\n\n'))
        // Send output event
        controller.enqueue(encoder.encode('event: subagent_output\ndata: {"lines":["🤖 agent/task-456 [light] — Test task","Line 1","Line 2"]}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.subagents[0]?.outputLines).toHaveLength(3)
      expect(result.current.subagents[0]?.outputLines).toEqual([
        '🤖 agent/task-456 [light] — Test task',
        'Line 1',
        'Line 2',
      ])
    })
  })

  it('should update status on subagent_complete event', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-123","description":"Test task","tier":"light"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-123","taskId":"task-456","status":"running"}\n\n'))
        // Send complete event
        controller.enqueue(encoder.encode('event: subagent_complete\ndata: {"taskId":"task-456","description":"Test task","success":true}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.subagents[0]?.status).toBe('completed')
    })
  })

  it('should mark subagent as failed when success is false', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-123","description":"Test task","tier":"light"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-123","taskId":"task-456","status":"running"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_complete\ndata: {"taskId":"task-456","description":"Test task","success":false}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.subagents[0]?.status).toBe('failed')
    })
  })
})

describe('useAgentStream - subagent polling after stream ends', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
    vi.mocked(trpc.session.subagents.query).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start polling when stream ends with running subagents', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-1","description":"Test task","tier":"light"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-1","taskId":"task-123","status":"running"}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    // Start the stream
    const streamPromise = result.current.sendAndStream('session-123')

    // Wait for stream to complete
    await streamPromise
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Verify subagent is in "running" state
    await waitFor(() => {
      expect(result.current.subagents).toHaveLength(1)
    })
    expect(result.current.subagents[0].status).toBe('running')

    // Mock the tRPC polling response (subagent still running)
    vi.mocked(trpc.session.subagents.query).mockResolvedValue([
      {
        id: 'sub-1',
        sessionId: 'session-123',
        taskId: 'task-123',
        description: 'Test task',
        status: 'running',
        tier: 'light',
        output: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      },
    ])

    // Wait for polling to be called (3 second interval)
    await waitFor(() => {
      expect(trpc.session.subagents.query).toHaveBeenCalledWith({ sessionId: 'session-123' })
    }, { timeout: 5000, interval: 100 })
  }, 7000)

  it('should update subagent status when polling returns completed', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-1","description":"Test task","tier":"light"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-1","taskId":"task-123","status":"running"}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    // First poll: still running
    vi.mocked(trpc.session.subagents.query).mockResolvedValueOnce([
      {
        id: 'sub-1',
        sessionId: 'session-123',
        taskId: 'task-123',
        description: 'Test task',
        status: 'running',
        tier: 'light',
        output: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      },
    ])

    // Wait for first poll
    await waitFor(() => {
      expect(vi.mocked(trpc.session.subagents.query).mock.calls.length).toBeGreaterThan(0)
    }, { timeout: 5000 })

    // Second poll: completed
    vi.mocked(trpc.session.subagents.query).mockResolvedValue([
      {
        id: 'sub-1',
        sessionId: 'session-123',
        taskId: 'task-123',
        description: 'Test task',
        status: 'completed',
        tier: 'light',
        output: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ])

    // Wait for second poll and status update
    await waitFor(() => {
      expect(result.current.subagents[0]?.status).toBe('completed')
    }, { timeout: 5000 })
  }, 10000)

  it('should stop polling when all subagents are completed or failed', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: subagent_spawn\ndata: {"toolCallId":"tool-1","description":"Test task","tier":"light"}\n\n'))
        controller.enqueue(encoder.encode('event: subagent_result\ndata: {"toolCallId":"tool-1","taskId":"task-123","status":"running"}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    // Mock polling response: subagent completed
    vi.mocked(trpc.session.subagents.query).mockResolvedValue([
      {
        id: 'sub-1',
        sessionId: 'session-123',
        taskId: 'task-123',
        description: 'Test task',
        status: 'completed',
        tier: 'light',
        output: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ])

    // Wait for first poll
    await waitFor(() => expect(trpc.session.subagents.query).toHaveBeenCalled(), { timeout: 5000 })

    const firstCallCount = vi.mocked(trpc.session.subagents.query).mock.calls.length

    // Wait a bit longer to ensure no more polls happen
    await new Promise(resolve => setTimeout(resolve, 4000))

    // Verify polling stopped (no new calls)
    expect(vi.mocked(trpc.session.subagents.query).mock.calls.length).toBe(firstCallCount)
  }, 10000)

  it('should not poll if stream ends with no subagents', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: text\ndata: {"content":"Hello"}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    // Wait a bit to ensure no polling happens
    await new Promise(resolve => setTimeout(resolve, 4000))

    // Verify no polling happened
    expect(trpc.session.subagents.query).not.toHaveBeenCalled()
  }, 6000)
})

describe('useAgentStream - error recovery', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('should NOT set error state when stream drops mid-response with partial text', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      async start(controller) {
        // Send some text
        controller.enqueue(encoder.encode('event: text\ndata: {"content":"Hello world, this is a partial"}\n\n'))
        // Simulate stream disconnect with an error (network issue)
        controller.error(new Error('Network connection lost'))
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Should NOT have an error since we got partial text
    expect(result.current.error).toBeNull()
    
    // Streaming text should still be visible (not cleared)
    expect(result.current.streamingText).toBe('Hello world, this is a partial')
  })

  it('should set error state when connection fails with NO text received', async () => {
    // Simulate a complete connection failure
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Should have an error since we never got any text
    expect(result.current.error).toBe('Network error')
  })

  it('should set error state when stream errors before any text', async () => {
    const encoder = new TextEncoder()
    const mockStream = new ReadableStream({
      start(controller) {
        // Immediately send error event without any text
        controller.enqueue(encoder.encode('event: error\ndata: {"error":"Server error"}\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })

    const { result } = renderHook(() => useAgentStream())
    
    await result.current.sendAndStream('session-123')

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Should have error since we never got any text
    expect(result.current.error).toBe('Server error')
  })
})
