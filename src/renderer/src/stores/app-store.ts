import { create } from 'zustand'
import type { Repository, Worktree, Message, ToolCall, SessionStatus } from '@shared/types'

interface SessionState {
  messages: Message[]
  toolCalls: ToolCall[]
  status: SessionStatus
}

interface AppState {
  // State
  repositories: Repository[]
  selectedWorktreeId: string | null
  sessions: Record<string, SessionState>
  isLoading: boolean
  error: string | null

  // Actions
  addRepository: (path: string) => Promise<void>
  removeRepository: (repoId: string) => Promise<void>
  refreshRepository: (repoId: string) => Promise<void>
  selectWorktree: (worktreeId: string | null) => void

  addWorktree: (repoPath: string, branch: string, baseBranch?: string) => Promise<void>
  removeWorktree: (repoPath: string, worktreePath: string, worktreeId: string) => Promise<void>

  sendMessage: (message: string) => Promise<void>
  abortAgent: () => Promise<void>

  // Internal actions for handling IPC events
  handleAgentMessage: (worktreeId: string, message: Message) => void
  handleAgentToolCall: (worktreeId: string, toolCall: ToolCall) => void
  handleAgentError: (worktreeId: string, error: string) => void

  setError: (error: string | null) => void
}

// Generate unique repository ID (browser-compatible)
function generateRepoId(path: string): string {
  return btoa(path).replace(/[/+=]/g, '_')
}

// Default session state
function createDefaultSession(): SessionState {
  return {
    messages: [],
    toolCalls: [],
    status: { isActive: false, isProcessing: false },
  }
}

// Track if an operation is in progress to prevent race conditions
let addRepositoryLock = false

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  repositories: [],
  selectedWorktreeId: null,
  sessions: {},
  isLoading: false,
  error: null,

  // Actions
  addRepository: async (path: string) => {
    // Prevent concurrent adds
    if (addRepositoryLock) {
      throw new Error('Another repository is being added')
    }

    // Check for duplicates
    if (get().repositories.some((r) => r.path === path)) {
      throw new Error('Repository already added')
    }

    addRepositoryLock = true
    set({ isLoading: true, error: null })

    try {
      const isRepo = await window.electronAPI.git.isGitRepository(path)
      if (!isRepo) {
        throw new Error('Selected directory is not a git repository')
      }

      const worktrees = await window.electronAPI.git.listWorktrees(path)

      const repo: Repository = {
        id: generateRepoId(path),
        path,
        name: path.split('/').pop() || path,
        worktrees,
      }

      set((state) => ({
        repositories: [...state.repositories, repo],
        isLoading: false,
      }))

      // Create sessions for each worktree
      for (const worktree of worktrees) {
        await window.electronAPI.agent.createSession(worktree.id, worktree.path)
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to add repository',
      })
      throw error
    } finally {
      addRepositoryLock = false
    }
  },

  removeRepository: async (repoId: string) => {
    const repo = get().repositories.find((r) => r.id === repoId)
    if (!repo) return

    // Clean up sessions for all worktrees in this repository
    for (const worktree of repo.worktrees) {
      try {
        await window.electronAPI.agent.removeSession(worktree.id)
      } catch (error) {
        console.error('Failed to remove session:', error)
      }
    }

    // Clean up sessions from state
    const worktreeIds = new Set(repo.worktrees.map((w) => w.id))

    set((state) => {
      const newSessions = { ...state.sessions }
      for (const id of worktreeIds) {
        delete newSessions[id]
      }

      return {
        repositories: state.repositories.filter((r) => r.id !== repoId),
        sessions: newSessions,
        selectedWorktreeId: worktreeIds.has(state.selectedWorktreeId || '')
          ? null
          : state.selectedWorktreeId,
      }
    })
  },

  refreshRepository: async (repoId: string) => {
    const repo = get().repositories.find((r) => r.id === repoId)
    if (!repo) return

    try {
      const worktrees = await window.electronAPI.git.listWorktrees(repo.path)

      set((state) => ({
        repositories: state.repositories.map((r) =>
          r.id === repoId ? { ...r, worktrees } : r
        ),
      }))

      // Create sessions for any new worktrees
      for (const worktree of worktrees) {
        if (!get().sessions[worktree.id]) {
          await window.electronAPI.agent.createSession(worktree.id, worktree.path)
        }
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to refresh repository' })
    }
  },

  selectWorktree: (worktreeId: string | null) => {
    set({ selectedWorktreeId: worktreeId })

    // Initialize session state if needed
    if (worktreeId && !get().sessions[worktreeId]) {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [worktreeId]: createDefaultSession(),
        },
      }))
    }
  },

  addWorktree: async (repoPath: string, branch: string, baseBranch?: string) => {
    set({ isLoading: true, error: null })

    try {
      await window.electronAPI.git.addWorktree(repoPath, branch, baseBranch)

      // Find and refresh the repository
      const repo = get().repositories.find((r) => r.path === repoPath)
      if (repo) {
        await get().refreshRepository(repo.id)
      }

      set({ isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to add worktree',
      })
      throw error
    }
  },

  removeWorktree: async (repoPath: string, worktreePath: string, worktreeId: string) => {
    set({ isLoading: true, error: null })

    try {
      await window.electronAPI.git.removeWorktree(repoPath, worktreePath)

      // Clean up the session
      try {
        await window.electronAPI.agent.removeSession(worktreeId)
      } catch (error) {
        console.error('Failed to remove session:', error)
      }

      // Find and refresh the repository
      const repo = get().repositories.find((r) => r.path === repoPath)
      if (repo) {
        await get().refreshRepository(repo.id)
      }

      // Clear selection if removed worktree was selected
      if (get().selectedWorktreeId === worktreeId) {
        set({ selectedWorktreeId: null })
      }

      // Remove session from state
      set((state) => {
        const newSessions = { ...state.sessions }
        delete newSessions[worktreeId]
        return { sessions: newSessions, isLoading: false }
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to remove worktree',
      })
      throw error
    }
  },

  sendMessage: async (message: string) => {
    const { selectedWorktreeId } = get()
    if (!selectedWorktreeId) {
      set({ error: 'No worktree selected' })
      return
    }

    // Ensure session exists
    const session = get().sessions[selectedWorktreeId] || createDefaultSession()

    // Update session status
    set((state) => ({
      sessions: {
        ...state.sessions,
        [selectedWorktreeId]: {
          ...session,
          status: { isActive: true, isProcessing: true },
        },
      },
    }))

    try {
      await window.electronAPI.agent.sendMessage(selectedWorktreeId, message)
    } catch (error) {
      set((state) => {
        const currentSession = state.sessions[selectedWorktreeId] || createDefaultSession()
        return {
          sessions: {
            ...state.sessions,
            [selectedWorktreeId]: {
              ...currentSession,
              status: {
                isActive: true,
                isProcessing: false,
                error: error instanceof Error ? error.message : 'Failed to send message',
              },
            },
          },
        }
      })
    }
  },

  abortAgent: async () => {
    const { selectedWorktreeId } = get()
    if (!selectedWorktreeId) return

    try {
      await window.electronAPI.agent.abort(selectedWorktreeId)

      set((state) => {
        const session = state.sessions[selectedWorktreeId] || createDefaultSession()
        return {
          sessions: {
            ...state.sessions,
            [selectedWorktreeId]: {
              ...session,
              status: { isActive: true, isProcessing: false },
            },
          },
        }
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to abort agent' })
    }
  },

  // IPC event handlers
  handleAgentMessage: (worktreeId: string, message: Message) => {
    set((state) => {
      const session = state.sessions[worktreeId] || createDefaultSession()

      // Check if we're updating an existing message (streaming)
      const existingIndex = session.messages.findIndex((m) => m.id === message.id)

      let updatedMessages: Message[]
      if (existingIndex >= 0) {
        updatedMessages = [...session.messages]
        updatedMessages[existingIndex] = message
      } else {
        updatedMessages = [...session.messages, message]
      }

      return {
        sessions: {
          ...state.sessions,
          [worktreeId]: {
            ...session,
            messages: updatedMessages,
            status: {
              ...session.status,
              isProcessing: message.isStreaming || false,
            },
          },
        },
      }
    })
  },

  handleAgentToolCall: (worktreeId: string, toolCall: ToolCall) => {
    set((state) => {
      const session = state.sessions[worktreeId] || createDefaultSession()

      // Check if we're updating an existing tool call
      const existingIndex = session.toolCalls.findIndex((tc) => tc.id === toolCall.id)

      let updatedToolCalls: ToolCall[]
      if (existingIndex >= 0) {
        updatedToolCalls = [...session.toolCalls]
        updatedToolCalls[existingIndex] = toolCall
      } else {
        updatedToolCalls = [...session.toolCalls, toolCall]
      }

      return {
        sessions: {
          ...state.sessions,
          [worktreeId]: {
            ...session,
            toolCalls: updatedToolCalls,
          },
        },
      }
    })
  },

  handleAgentError: (worktreeId: string, error: string) => {
    set((state) => {
      const session = state.sessions[worktreeId] || createDefaultSession()
      return {
        sessions: {
          ...state.sessions,
          [worktreeId]: {
            ...session,
            status: { isActive: true, isProcessing: false, error },
          },
        },
      }
    })
  },

  setError: (error: string | null) => {
    set({ error })
  },
}))
