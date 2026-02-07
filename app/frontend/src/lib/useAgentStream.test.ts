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
 */

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
