import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubagentPanel } from './SubagentPanel'
import type { SubagentInfo } from '@/lib/useAgentStream'

/**
 * SubagentPanel tests — verifies rendering of subagent activity.
 * 
 * Tests:
 * - Empty state (no subagents)
 * - Single running subagent
 * - Multiple subagents with mixed states
 * - Completed and failed states
 */

describe('SubagentPanel', () => {
  it('should not render when there are no subagents', () => {
    const { container } = render(<SubagentPanel subagents={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('should show count badge for running subagents', () => {
    const subagents: SubagentInfo[] = [
      {
        toolCallId: 'tool-1',
        taskId: 'task-1',
        description: 'Running task 1',
        tier: 'light',
        status: 'running',
        outputLines: [],
      },
      {
        toolCallId: 'tool-2',
        taskId: 'task-2',
        description: 'Running task 2',
        tier: 'standard',
        status: 'running',
        outputLines: [],
      },
    ]

    render(<SubagentPanel subagents={subagents} />)
    expect(screen.getByText(/2 agents running/i)).toBeInTheDocument()
  })

  it('should show count badge for completed subagents', () => {
    const subagents: SubagentInfo[] = [
      {
        toolCallId: 'tool-1',
        taskId: 'task-1',
        description: 'Completed task',
        tier: 'light',
        status: 'completed',
        outputLines: [],
      },
    ]

    render(<SubagentPanel subagents={subagents} />)
    expect(screen.getByText(/1 agent completed/i)).toBeInTheDocument()
  })

  it('should render subagent cards with descriptions', () => {
    const subagents: SubagentInfo[] = [
      {
        toolCallId: 'tool-1',
        taskId: 'task-1',
        description: 'Test task description',
        tier: 'light',
        status: 'running',
        outputLines: [],
      },
    ]

    render(<SubagentPanel subagents={subagents} />)
    expect(screen.getByText('Test task description')).toBeInTheDocument()
  })

  it('should show tier badge', () => {
    const subagents: SubagentInfo[] = [
      {
        toolCallId: 'tool-1',
        taskId: 'task-1',
        description: 'Test task',
        tier: 'standard',
        status: 'running',
        outputLines: [],
      },
    ]

    render(<SubagentPanel subagents={subagents} />)
    expect(screen.getByText('standard')).toBeInTheDocument()
  })

  it('should show output lines when present', () => {
    const subagents: SubagentInfo[] = [
      {
        toolCallId: 'tool-1',
        taskId: 'task-1',
        description: 'Test task',
        tier: 'light',
        status: 'running',
        outputLines: ['Line 1', 'Line 2', 'Line 3'],
      },
    ]

    render(<SubagentPanel subagents={subagents} />)
    expect(screen.getByText('Line 1')).toBeInTheDocument()
    expect(screen.getByText('Line 2')).toBeInTheDocument()
    expect(screen.getByText('Line 3')).toBeInTheDocument()
  })

  it('should differentiate status with visual indicators', () => {
    const subagents: SubagentInfo[] = [
      {
        toolCallId: 'tool-1',
        taskId: 'task-1',
        description: 'Running task',
        tier: 'light',
        status: 'running',
        outputLines: [],
      },
      {
        toolCallId: 'tool-2',
        taskId: 'task-2',
        description: 'Completed task',
        tier: 'light',
        status: 'completed',
        outputLines: [],
      },
      {
        toolCallId: 'tool-3',
        taskId: 'task-3',
        description: 'Failed task',
        tier: 'light',
        status: 'failed',
        outputLines: [],
      },
    ]

    const { container } = render(<SubagentPanel subagents={subagents} />)
    
    // Should render all three tasks
    expect(screen.getByText('Running task')).toBeInTheDocument()
    expect(screen.getByText('Completed task')).toBeInTheDocument()
    expect(screen.getByText('Failed task')).toBeInTheDocument()
    
    // Check for status-specific classes (basic check that different statuses render)
    expect(container.querySelector('[data-status="running"]')).toBeInTheDocument()
    expect(container.querySelector('[data-status="completed"]')).toBeInTheDocument()
    expect(container.querySelector('[data-status="failed"]')).toBeInTheDocument()
  })
})
