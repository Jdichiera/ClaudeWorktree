// Git types
export interface Repository {
  id: string
  path: string
  name: string
  worktrees: Worktree[]
}

export interface Worktree {
  id: string
  path: string
  branch: string
  isMain: boolean
  hasChanges: boolean
}

// Agent types
export interface SessionStatus {
  isActive: boolean
  isProcessing: boolean
  error?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'pending' | 'running' | 'completed' | 'error'
  timestamp: number
}

export interface FileEdit {
  path: string
  oldContent: string
  newContent: string
  diff?: string
}

export interface BashExecution {
  command: string
  output: string
  exitCode: number
}

// SDK Event types (simplified for IPC)
export type SDKEventType =
  | 'message_start'
  | 'content_block_delta'
  | 'message_stop'
  | 'tool_use'
  | 'tool_result'
  | 'error'

export interface SDKEvent {
  type: SDKEventType
  worktreeId: string
  data: unknown
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Git operations
  GIT_LIST_WORKTREES: 'git:list-worktrees',
  GIT_ADD_WORKTREE: 'git:add-worktree',
  GIT_REMOVE_WORKTREE: 'git:remove-worktree',
  GIT_IS_REPOSITORY: 'git:is-repository',
  GIT_GET_BRANCHES: 'git:get-branches',

  // Agent operations
  AGENT_CREATE_SESSION: 'agent:create-session',
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_ABORT: 'agent:abort',
  AGENT_GET_STATUS: 'agent:get-status',

  // Agent events (main -> renderer)
  AGENT_MESSAGE: 'agent:message',
  AGENT_TOOL_CALL: 'agent:tool-call',
  AGENT_ERROR: 'agent:error',

  // Dialog
  SHOW_OPEN_DIALOG: 'dialog:open',
} as const

// Electron API exposed via preload
export interface ElectronAPI {
  git: {
    listWorktrees: (repoPath: string) => Promise<Worktree[]>
    addWorktree: (repoPath: string, branch: string, baseBranch?: string) => Promise<void>
    removeWorktree: (repoPath: string, worktreePath: string) => Promise<void>
    isGitRepository: (path: string) => Promise<boolean>
    getBranches: (repoPath: string) => Promise<string[]>
  }
  agent: {
    createSession: (worktreeId: string, cwd: string) => Promise<void>
    sendMessage: (worktreeId: string, message: string) => Promise<void>
    abort: (worktreeId: string) => Promise<void>
    getStatus: (worktreeId: string) => Promise<SessionStatus>
  }
  onAgentMessage: (callback: (worktreeId: string, message: Message) => void) => () => void
  onAgentToolCall: (callback: (worktreeId: string, toolCall: ToolCall) => void) => () => void
  onAgentError: (callback: (worktreeId: string, error: string) => void) => () => void
  showOpenDialog: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
