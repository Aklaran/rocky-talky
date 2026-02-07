import { useState } from 'react'
import { Wrench, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolCall } from '@/lib/useAgentStream'

/**
 * ToolCallIndicator — shows active tool executions during streaming.
 *
 * Design:
 * - Small pill/badge showing tool name
 * - Animates (pulse) while active
 * - Grays out when complete
 * - Collapsed by default, can expand to show all tools
 */

interface ToolCallIndicatorProps {
  tools: ToolCall[]
}

export function ToolCallIndicator({ tools }: ToolCallIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (tools.length === 0) return null

  const activeTool = tools.find((t) => !t.isComplete)
  const completedCount = tools.filter((t) => t.isComplete).length

  return (
    <div className="mt-2 space-y-1">
      {/* Active tool indicator (always shown) */}
      {activeTool && (
        <div className="flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 w-fit">
          <Wrench className="h-3 w-3 text-orange-600 animate-pulse" />
          <span className="text-xs font-medium text-orange-600">
            {getToolDisplayName(activeTool.toolName)}...
          </span>
        </div>
      )}

      {/* Expand/collapse button (if multiple tools) */}
      {tools.length > 1 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          <span>
            {completedCount} of {tools.length} tools completed
          </span>
        </button>
      )}

      {/* Expanded tool list */}
      {isExpanded && (
        <div className="space-y-1 pl-2">
          {tools.map((tool) => (
            <div
              key={tool.toolCallId}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-xs',
                tool.isComplete
                  ? tool.isError
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted/50 text-muted-foreground'
                  : 'bg-orange-500/10 text-orange-600'
              )}
            >
              <Wrench
                className={cn(
                  'h-3 w-3',
                  !tool.isComplete && 'animate-pulse'
                )}
              />
              <span className="flex-1">{getToolDisplayName(tool.toolName)}</span>
              {tool.isComplete && (
                <span className="text-xs">
                  {tool.isError ? '✗' : '✓'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Convert tool names to human-readable display names.
 */
function getToolDisplayName(toolName: string): string {
  const displayNames: Record<string, string> = {
    Read: 'Reading file',
    Write: 'Writing file',
    Edit: 'Editing file',
    Bash: 'Running command',
    memory_search: 'Searching memory',
    spawn_agent: 'Spawning agent',
    check_agents: 'Checking agents',
    check_budget: 'Checking budget',
    review_agent: 'Reviewing agent',
    merge_agent: 'Merging agent',
    log_reflection: 'Logging reflection',
  }

  return displayNames[toolName] || toolName
}
