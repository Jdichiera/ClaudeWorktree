import { useAppStore } from '../../stores/app-store'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'

export function ChatPanel() {
  const { selectedWorktreeId, repositories, sessions } = useAppStore()

  // Find selected worktree
  let selectedWorktree = null
  for (const repo of repositories) {
    const found = repo.worktrees.find((w) => w.id === selectedWorktreeId)
    if (found) {
      selectedWorktree = found
      break
    }
  }

  const session = selectedWorktreeId ? sessions[selectedWorktreeId] : null

  if (!selectedWorktreeId || !selectedWorktree) {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <h2>No worktree selected</h2>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 15C21 15.55 20.55 16 20 16H11L7 20V16H4C3.45 16 3 15.55 3 15V5C3 4.45 3.45 4 4 4H20C20.55 4 21 4.45 21 5V15Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3>Select a worktree</h3>
          <p>Choose a worktree from the sidebar to start a conversation with Claude</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: 'var(--accent-primary)' }}
        >
          <path
            d="M6 3V15C6 15 6 17 9 17H21"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <h2>{selectedWorktree.branch}</h2>
        {session?.status.isProcessing && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)',
                animation: 'pulse 1.5s infinite',
              }}
            />
            Processing...
          </span>
        )}
        {session?.status.error && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: 'var(--error)',
            }}
          >
            Error: {session.status.error}
          </span>
        )}
      </div>
      <MessageList messages={session?.messages || []} />
      <InputBox disabled={session?.status.isProcessing || false} />
    </div>
  )
}
