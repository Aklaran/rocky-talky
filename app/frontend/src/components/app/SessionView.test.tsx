import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionView } from './SessionView'

// Mock child components to avoid context dependencies
vi.mock('./SessionHeader', () => ({
  SessionHeader: () => <div>Session Header</div>,
}))

vi.mock('./MessageInput', () => ({
  MessageInput: () => <div>Message Input</div>,
}))

vi.mock('./MessageList', () => ({
  MessageList: () => <div>Message List</div>,
}))

// Mock the router and tRPC
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      session: {
        get: {
          invalidate: vi.fn(),
        },
        list: {
          invalidate: vi.fn(),
        },
      },
    }),
    session: {
      get: {
        useQuery: vi.fn(() => ({
          data: {
            id: 'session-1',
            title: 'Test Session',
            tags: [],
            status: 'active',
            modelUsed: 'claude-3',
            tokensUsed: 100,
            compactionCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            subagents: [
              {
                id: 'sub-1',
                sessionId: 'session-1',
                taskId: 'task-1',
                description: 'Historical subagent task',
                status: 'completed',
                tier: 'light',
                output: 'Task completed',
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
          },
          isLoading: false,
          error: null,
        })),
      },
      sendMessage: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}))

vi.mock('@/lib/useAgentStream', () => ({
  useAgentStream: () => ({
    streamingText: '',
    isStreaming: false,
    isCompacting: false,
    activeTools: [],
    subagents: [],
    error: null,
    sendAndStream: vi.fn(),
  }),
}))

describe('SessionView - subagent integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render historical subagents from session data', () => {
    render(<SessionView sessionId="session-1" />)
    
    // Should show the historical subagent
    expect(screen.getByText('Historical subagent task')).toBeInTheDocument()
  })
})
