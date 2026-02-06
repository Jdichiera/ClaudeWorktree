import type { Message as MessageType } from '../../types'

interface MessageProps {
  message: MessageType
}

export function Message({ message }: MessageProps) {
  return (
    <div
      className={`message message-${message.role} ${message.isStreaming ? 'message-streaming' : ''}`}
      data-testid={`message-${message.role}`}
    >
      {formatContent(message.content)}
    </div>
  )
}

// Simple markdown-like formatting
function formatContent(content: string): JSX.Element {
  // Split by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          // Code block
          const lines = part.slice(3, -3).split('\n')
          const language = lines[0] || ''
          const code = lines.slice(language ? 1 : 0).join('\n') || lines[0]

          return (
            <pre key={index}>
              <code>{code}</code>
            </pre>
          )
        }

        // Regular text - handle inline code
        const inlineParts = part.split(/(`[^`]+`)/g)
        return (
          <span key={index}>
            {inlineParts.map((inlinePart, inlineIndex) => {
              if (inlinePart.startsWith('`') && inlinePart.endsWith('`')) {
                return <code key={inlineIndex}>{inlinePart.slice(1, -1)}</code>
              }
              // Handle line breaks
              return inlinePart.split('\n').map((line, lineIndex, arr) => (
                <span key={`${inlineIndex}-${lineIndex}`}>
                  {line}
                  {lineIndex < arr.length - 1 && <br />}
                </span>
              ))
            })}
          </span>
        )
      })}
    </>
  )
}
