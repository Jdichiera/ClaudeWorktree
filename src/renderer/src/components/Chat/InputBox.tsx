import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'

interface InputBoxProps {
  disabled?: boolean
}

export function InputBox({ disabled = false }: InputBoxProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, abortAgent, selectedWorktreeId, sessions } = useAppStore()

  const session = selectedWorktreeId ? sessions[selectedWorktreeId] : null
  const isProcessing = session?.status.isProcessing || false

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSubmit = async () => {
    if (!message.trim() || disabled || isProcessing) return

    const currentMessage = message
    setMessage('')

    try {
      await sendMessage(currentMessage)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isProcessing
              ? 'Waiting for response...'
              : 'Send a message... (Shift+Enter for new line)'
          }
          disabled={disabled || isProcessing}
          rows={1}
        />
        {isProcessing ? (
          <button
            className="send-button"
            onClick={abortAgent}
            style={{ backgroundColor: 'var(--error)' }}
          >
            Stop
          </button>
        ) : (
          <button
            className="send-button"
            onClick={handleSubmit}
            disabled={!message.trim() || disabled}
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
