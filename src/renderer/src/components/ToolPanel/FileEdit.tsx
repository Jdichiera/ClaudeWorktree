import type { ToolCall } from '../../types'

interface FileEditProps {
  toolCall: ToolCall
}

export function FileEdit({ toolCall }: FileEditProps) {
  const input = toolCall.input as {
    file_path?: string
    path?: string
    old_string?: string
    new_string?: string
    content?: string
  }

  const filePath = input.file_path || input.path || 'unknown'
  const fileName = filePath.split('/').pop() || filePath

  // Determine the operation type
  let operation = toolCall.name
  if (toolCall.name === 'Edit') {
    operation = 'Edit'
  } else if (toolCall.name === 'Write') {
    operation = 'Write'
  } else if (toolCall.name === 'Read') {
    operation = 'Read'
  }

  // Icon based on operation
  const Icon = () => {
    if (operation === 'Read') {
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 2V8H20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    }
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 20H21"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.5 3.50001C16.8978 3.10219 17.4374 2.87869 18 2.87869C18.2786 2.87869 18.5544 2.93356 18.8118 3.04017C19.0692 3.14677 19.303 3.30303 19.5 3.50001C19.697 3.697 19.8532 3.93085 19.9598 4.18822C20.0665 4.44559 20.1213 4.72144 20.1213 5.00001C20.1213 5.27859 20.0665 5.55444 19.9598 5.81181C19.8532 6.06918 19.697 6.30303 19.5 6.50001L7 19L3 20L4 16L16.5 3.50001Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <div className="tool-call">
      <div className="tool-call-header">
        <Icon />
        <span className="tool-call-name">{operation}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={filePath}
        >
          {fileName}
        </span>
        <span className={`tool-call-status ${toolCall.status}`}>{toolCall.status}</span>
      </div>
      {(input.old_string || input.new_string || input.content) && (
        <div className="tool-call-body">
          {input.old_string && (
            <div style={{ color: 'var(--error)', marginBottom: '4px' }}>
              - {input.old_string.slice(0, 100)}
              {input.old_string.length > 100 && '...'}
            </div>
          )}
          {input.new_string && (
            <div style={{ color: 'var(--success)' }}>
              + {input.new_string.slice(0, 100)}
              {input.new_string.length > 100 && '...'}
            </div>
          )}
          {input.content && !input.old_string && (
            <div>
              {input.content.slice(0, 200)}
              {input.content.length > 200 && '...'}
            </div>
          )}
        </div>
      )}
      {toolCall.output && (
        <div
          className="tool-call-body"
          style={{
            borderTop: '1px solid var(--border-color)',
            maxHeight: '150px',
            overflow: 'auto',
          }}
        >
          {toolCall.output.slice(0, 500)}
          {toolCall.output.length > 500 && '...'}
        </div>
      )}
    </div>
  )
}
