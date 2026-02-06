import { useAppStore } from '../../stores/app-store'
import type { Worktree } from '../../types'

interface WorktreeItemProps {
  worktree: Worktree
  repoPath: string
}

export function WorktreeItem({ worktree, repoPath }: WorktreeItemProps) {
  const { selectedWorktreeId, selectWorktree, removeWorktree, sessions } = useAppStore()

  const isSelected = selectedWorktreeId === worktree.id
  const session = sessions[worktree.id]
  const isProcessing = session?.status.isProcessing || false

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (worktree.isMain) {
      await window.electronAPI.dialog.alert('Cannot remove the main worktree')
      return
    }

    const confirmed = await window.electronAPI.dialog.confirm(
      `Remove worktree for branch "${worktree.branch}"?`,
      'Remove Worktree'
    )

    if (confirmed) {
      try {
        await removeWorktree(repoPath, worktree.path, worktree.id)
      } catch (error) {
        await window.electronAPI.dialog.alert(
          error instanceof Error ? error.message : 'Failed to remove worktree',
          'Error'
        )
      }
    }
  }

  return (
    <div
      className={`worktree-item ${isSelected ? 'active' : ''}`}
      onClick={() => selectWorktree(worktree.id)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
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

      <span className="worktree-branch">{worktree.branch}</span>

      <div
        className={`worktree-status ${worktree.hasChanges ? 'has-changes' : ''} ${
          isProcessing ? 'processing' : ''
        }`}
        title={
          isProcessing
            ? 'Processing'
            : worktree.hasChanges
              ? 'Uncommitted changes'
              : 'Clean'
        }
      />

      {!worktree.isMain && (
        <button
          className="btn-icon"
          onClick={handleRemove}
          title="Remove Worktree"
          style={{ opacity: 0, transition: 'opacity 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
        >
          <svg
            width="10"
            height="10"
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
      )}
    </div>
  )
}
