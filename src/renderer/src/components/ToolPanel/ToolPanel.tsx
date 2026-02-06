import { useAppStore } from '../../stores/app-store'
import { FileEdit } from './FileEdit'
import { BashOutput } from './BashOutput'

export function ToolPanel() {
  const { selectedWorktreeId, sessions } = useAppStore()

  const session = selectedWorktreeId ? sessions[selectedWorktreeId] : null
  const toolCalls = session?.toolCalls || []

  // Filter for file edits and bash commands
  const fileEdits = toolCalls.filter(
    (tc) => tc.name === 'Edit' || tc.name === 'Write' || tc.name === 'Read'
  )
  const bashCalls = toolCalls.filter((tc) => tc.name === 'Bash')

  return (
    <div className="tool-panel" data-testid="tool-panel">
      <div className="tool-panel-header">
        <h3>Activity</h3>
      </div>
      <div className="tool-panel-content">
        {toolCalls.length === 0 ? (
          <div
            className="empty-state"
            style={{ height: 'auto', padding: '32px 16px', fontSize: '13px' }}
          >
            <p style={{ color: 'var(--text-muted)' }}>
              Tool calls will appear here
            </p>
          </div>
        ) : (
          <>
            {toolCalls.map((toolCall) => {
              if (toolCall.name === 'Bash') {
                return <BashOutput key={toolCall.id} toolCall={toolCall} />
              }
              if (
                toolCall.name === 'Edit' ||
                toolCall.name === 'Write' ||
                toolCall.name === 'Read'
              ) {
                return <FileEdit key={toolCall.id} toolCall={toolCall} />
              }
              // Generic tool call display
              return (
                <div key={toolCall.id} className="tool-call">
                  <div className="tool-call-header">
                    <span className="tool-call-name">{toolCall.name}</span>
                    <span className={`tool-call-status ${toolCall.status}`}>
                      {toolCall.status}
                    </span>
                  </div>
                  <div className="tool-call-body">
                    {JSON.stringify(toolCall.input, null, 2)}
                  </div>
                  {toolCall.output && (
                    <div
                      className="tool-call-body"
                      style={{ borderTop: '1px solid var(--border-color)' }}
                    >
                      {toolCall.output.length > 500
                        ? `${toolCall.output.slice(0, 500)}...`
                        : toolCall.output}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
