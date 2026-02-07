import type { UsageStats } from '../../types'

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return String(tokens)
}

function formatCost(usd: number): string {
  if (usd >= 1) {
    return `$${usd.toFixed(2)}`
  }
  if (usd >= 0.01) {
    return `$${usd.toFixed(3)}`
  }
  return `$${usd.toFixed(4)}`
}

const CONTEXT_LIMIT = 200_000

export function UsageBar({ usage }: { usage: UsageStats | null }) {
  if (!usage) return null

  const totalTokens = usage.inputTokens + usage.outputTokens
  const contextPercent = Math.min((totalTokens / CONTEXT_LIMIT) * 100, 100)

  return (
    <div className="usage-bar">
      <div className="usage-bar-item">
        <div className="usage-context-bar-track">
          <div
            className="usage-context-bar-fill"
            style={{ width: `${contextPercent}%` }}
          />
        </div>
        <span>{formatTokenCount(totalTokens)} / {formatTokenCount(CONTEXT_LIMIT)}</span>
      </div>
      <div className="usage-bar-item">
        {formatCost(usage.totalCostUsd)}
      </div>
      <div className="usage-bar-item">
        {usage.totalTurns} {usage.totalTurns === 1 ? 'turn' : 'turns'}
      </div>
    </div>
  )
}
