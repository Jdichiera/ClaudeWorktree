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
  removeRepository: (repoId: string) => void
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

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  repositories: [],
  selectedWorktreeId: null,
  sessions: {},
  isLoading: false,
  error: null,

  // Actions
  addRepository: async (path: string) => {
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
        error: error instanceof Error ? error.message : 'Failed to add repository'
      })
      throw error
    }
  },

  removeRepository: (repoId: string) => {
    set((state) => ({
      repositories: state.repositories.filter((r) => r.id !== repoId),
      selectedWorktreeId:
        state.repositories.find((r) => r.id === repoId)?.worktrees.some(
          (w) => w.id === state.selectedWorktreeId
        )
          ? null
          : state.selectedWorktreeId,
    }))
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
          [worktreeId]: {
            messages: [],
            toolCalls: [],
            status: { isActive: false, isProcessing: false },
          },
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
        error: error instanceof Error ? error.message : 'Failed to add worktree'
      })
      throw error
    }
  },

  removeWorktree: async (repoPath: string, worktreePath: string, worktreeId: string) => {
    set({ isLoading: true, error: null })

    try {
      await window.electronAPI.git.removeWorktree(repoPath, worktreePath)

      // Find and refresh the repository
      const repo = get().repositories.find((r) => r.path === repoPath)
      if (repo) {
        await get().refreshRepository(repo.id)
      }

      // Clear selection if removed worktree was selected
      if (get().selectedWorktreeId === worktreeId) {
        set({ selectedWorktreeId: null })
      }

      set({ isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to remove worktree'
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

    // Update session status
    set((state) => ({
      sessions: {
        ...state.sessions,
        [selectedWorktreeId]: {
          ...state.sessions[selectedWorktreeId],
          status: { isActive: true, isProcessing: true },
        },
      },
    }))

    try {
      await window.electronAPI.agent.sendMessage(selectedWorktreeId, message)
    } catch (error) {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [selectedWorktreeId]: {
            ...state.sessions[selectedWorktreeId],
            status: {
              isActive: true,
              isProcessing: false,
              error: error instanceof Error ? error.message : 'Failed to send message'
            },
          },
        },
      }))
    }
  },

  abortAgent: async () => {
    const { selectedWorktreeId } = get()
    if (!selectedWorktreeId) return

    try {
      await window.electronAPI.agent.abort(selectedWorktreeId)

      set((state) => ({
        sessions: {
          ...state.sessions,
          [selectedWorktreeId]: {
            ...state.sessions[selectedWorktreeId],
            status: { isActive: true, isProcessing: false },
          },
        },
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to abort agent' })
    }
  },

  // IPC event handlers
  handleAgentMessage: (worktreeId: string, message: Message) => {
    set((state) => {
      const session = state.sessions[worktreeId] || {
        messages: [],
        toolCalls: [],
        status: { isActive: true, isProcessing: false },
      }

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
      const session = state.sessions[worktreeId] || {
        messages: [],
        toolCalls: [],
        status: { isActive: true, isProcessing: true },
      }

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
    set((state) => ({
      sessions: {
        ...state.sessions,
        [worktreeId]: {
          ...state.sessions[worktreeId],
          status: { isActive: true, isProcessing: false, error },
        },
      },
    }))
  },

  setError: (error: string | null) => {
    set({ error })
  },
}))
