import { useState } from 'react'
import { useAppStore } from '../../stores/app-store'
import { WorktreeItem } from './WorktreeItem'
import type { Repository } from '../../types'

interface RepoSectionProps {
  repository: Repository
}

export function RepoSection({ repository }: RepoSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showAddWorktree, setShowAddWorktree] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')

  const { refreshRepository, addWorktree, removeRepository, isLoading } = useAppStore()

  const handleAddWorktree = async () => {
    if (!newBranchName.trim()) return

    try {
      await addWorktree(repository.path, newBranchName.trim(), 'main')
      setNewBranchName('')
      setShowAddWorktree(false)
    } catch (err) {
      console.error('Failed to add worktree:', err)
    }
  }

  const handleRemoveRepo = () => {
    if (confirm(`Remove ${repository.name} from the list?`)) {
      removeRepository(repository.id)
    }
  }

  return (
    <div className="repo-section">
      <div className="repo-header" onClick={() => setIsExpanded(!isExpanded)}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          <path
            d="M4.5 2.5L8 6L4.5 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: 'var(--accent-primary)' }}
        >
          <path
            d="M9 19C9 20.1 9.9 21 11 21H13C14.1 21 15 20.1 15 19V5C15 3.9 14.1 3 13 3H11C9.9 3 9 3.9 9 5V19Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M5 7L9 7M5 17L9 17" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15 7L19 7M15 17L19 17" stroke="currentColor" strokeWidth="1.5" />
        </svg>

        <span className="repo-name">{repository.name}</span>

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation()
            refreshRepository(repository.id)
          }}
          title="Refresh"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M21 12C21 16.97 16.97 21 12 21C7.03 21 4 17 4 17M3 12C3 7.03 7.03 3 12 3C18 3 21 8 21 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 3V8H16M3 21V16H8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation()
            setShowAddWorktree(true)
          }}
          title="Add Worktree"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 3V13M3 8H13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation()
            handleRemoveRepo()
          }}
          title="Remove Repository"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 3L3 9M3 3L9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="worktree-list">
          {showAddWorktree && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px',
                marginBottom: '4px',
              }}
            >
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="New branch name"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddWorktree()
                  if (e.key === 'Escape') {
                    setShowAddWorktree(false)
                    setNewBranchName('')
                  }
                }}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={handleAddWorktree}
                disabled={!newBranchName.trim() || isLoading}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Add
              </button>
            </div>
          )}

          {repository.worktrees.map((worktree) => (
            <WorktreeItem
              key={worktree.id}
              worktree={worktree}
              repoPath={repository.path}
            />
          ))}
        </div>
      )}
    </div>
  )
}
