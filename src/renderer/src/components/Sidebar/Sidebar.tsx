import { useAppStore } from '../../stores/app-store'
import { RepoSection } from './RepoSection'

export function Sidebar() {
  const { repositories, isLoading, error, setError } = useAppStore()

  const handleOpenRepository = async () => {
    try {
      const path = await window.electronAPI.showOpenDialog()
      if (path) {
        await useAppStore.getState().addRepository(path)
      }
    } catch (err) {
      console.error('Failed to open repository:', err)
    }
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Claude Worktree</h1>
        <button
          className="btn-icon"
          onClick={handleOpenRepository}
          disabled={isLoading}
          title="Open Repository"
        >
          <svg
            width="16"
            height="16"
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
      </div>

      <div className="sidebar-content">
        {error && (
          <div
            className="error-banner"
            style={{
              padding: '8px 12px',
              marginBottom: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              color: '#ef4444',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              className="btn-icon"
              onClick={() => setError(null)}
              style={{ color: '#ef4444' }}
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
        )}

        {repositories.length === 0 ? (
          <div className="empty-state" style={{ height: 'auto', padding: '48px 16px' }}>
            <div className="empty-state-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>No repositories</h3>
            <p>Open a git repository to get started</p>
            <button className="btn btn-primary" onClick={handleOpenRepository}>
              Open Repository
            </button>
          </div>
        ) : (
          repositories.map((repo) => <RepoSection key={repo.id} repository={repo} />)
        )}
      </div>
    </div>
  )
}
