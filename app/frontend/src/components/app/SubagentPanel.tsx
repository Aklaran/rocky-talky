import { Bot, Check, X } from 'lucide-react'
import type { SubagentInfo } from '@/lib/useAgentStream'

interface SubagentPanelProps {
  subagents: SubagentInfo[]
}

export function SubagentPanel({ subagents }: SubagentPanelProps) {
  if (subagents.length === 0) {
    return null
  }

  const runningCount = subagents.filter((s) => s.status === 'running' || s.status === 'spawning').length
  const completedCount = subagents.filter((s) => s.status === 'completed').length

  return (
    <div className="space-y-2 px-4 pb-2">
      {/* Count badge */}
      {runningCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {runningCount} {runningCount === 1 ? 'agent' : 'agents'} running
        </div>
      )}
      {runningCount === 0 && completedCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {completedCount} {completedCount === 1 ? 'agent' : 'agents'} completed
        </div>
      )}

      {/* Subagent cards */}
      <div className="space-y-2">
        {subagents.map((subagent) => (
          <SubagentCard key={subagent.toolCallId} subagent={subagent} />
        ))}
      </div>
    </div>
  )
}

interface SubagentCardProps {
  subagent: SubagentInfo
}

function SubagentCard({ subagent }: SubagentCardProps) {
  const { status, description, tier, outputLines } = subagent

  return (
    <div
      className="rounded-lg bg-muted/50 p-3 space-y-2"
      data-status={status}
    >
      {/* Header: status icon, description, tier */}
      <div className="flex items-start gap-2">
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{description}</p>
        </div>
        {tier && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {tier}
          </span>
        )}
      </div>

      {/* Output lines */}
      {outputLines.length > 0 && (
        <div className="rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground space-y-0.5">
          {outputLines.map((line, i) => (
            <div key={i} className="truncate">{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: SubagentInfo['status'] }) {
  switch (status) {
    case 'spawning':
    case 'running':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
          <Bot className="h-3 w-3 text-orange-600 animate-pulse" />
        </div>
      )
    case 'completed':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/10">
          <Check className="h-3 w-3 text-green-600" />
        </div>
      )
    case 'failed':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/10">
          <X className="h-3 w-3 text-red-600" />
        </div>
      )
  }
}
