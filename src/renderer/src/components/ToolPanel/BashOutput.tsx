import type { ToolCall } from '../../types'

interface BashOutputProps {
  toolCall: ToolCall
}

export function BashOutput({ toolCall }: BashOutputProps) {
  const input = toolCall.input as { command?: string }
  const command = input.command || 'unknown command'

  return (
    <div className="tool-call">
      <div className="tool-call-header">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 17L10 11L4 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 19H20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="tool-call-name">Bash</span>
        <span className={`tool-call-status ${toolCall.status}`}>{toolCall.status}</span>
      </div>
      <div className="tool-call-body" style={{ color: 'var(--accent-primary)' }}>
        $ {command.length > 80 ? `${command.slice(0, 80)}...` : command}
      </div>
      {toolCall.output && (
        <div
          className="tool-call-body"
          style={{
            borderTop: '1px solid var(--border-color)',
            maxHeight: '200px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {toolCall.output.slice(0, 1000)}
          {toolCall.output.length > 1000 && '\n... (truncated)'}
        </div>
      )}
    </div>
  )
}
