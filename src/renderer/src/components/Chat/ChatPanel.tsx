import { useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { UsageBar } from './UsageBar'

export function ChatPanel() {
  const {
    selectedWorktreeId,
    repositories,
    sessions,
    authStatus,
    authChecking,
    checkAuth,
    openLoginTerminal,
  } = useAppStore()

  // Check auth status when a worktree is selected and auth hasn't been checked yet
  useEffect(() => {
    if (selectedWorktreeId && !authStatus && !authChecking) {
      checkAuth()
    }
  }, [selectedWorktreeId, authStatus, authChecking, checkAuth])

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
      {authStatus && !authStatus.authenticated && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-tertiary, #2a2a2a)',
            borderBottom: '1px solid var(--border, #333)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, color: 'var(--warning, #f0a030)' }}
          >
            <path
              d="M12 9V13M12 17H12.01M5.07 19H18.93C20.39 19 21.32 17.43 20.6 16.16L13.67 3.79C12.95 2.52 11.05 2.52 10.33 3.79L3.4 16.16C2.68 17.43 3.61 19 5.07 19Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ flex: 1, color: 'var(--text-secondary, #aaa)' }}>
            {!authStatus.installed
              ? 'Claude CLI is not installed. Please install it first.'
              : authStatus.error || 'Not logged in. Please authenticate with Claude CLI.'}
          </span>
          {authStatus.installed && (
            <button
              onClick={async () => {
                await openLoginTerminal()
              }}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: 'var(--accent-primary, #6366f1)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Open Terminal to Login
            </button>
          )}
          <button
            onClick={() => checkAuth()}
            disabled={authChecking}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary, #aaa)',
              border: '1px solid var(--border, #555)',
              borderRadius: '4px',
              cursor: authChecking ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {authChecking ? 'Checking...' : 'Re-check'}
          </button>
        </div>
      )}
      <MessageList messages={session?.messages || []} isProcessing={session?.status.isProcessing} />
      <InputBox disabled={session?.status.isProcessing || false} />
      <UsageBar usage={session?.usage ?? null} />
    </div>
  )
}
