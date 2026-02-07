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

export interface UsageStats {
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  totalTurns: number
  lastDurationMs: number
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

// Auth check result
export interface AuthStatus {
  installed: boolean
  authenticated: boolean
  claudePath?: string
  error?: string
}

// Bug report types
export interface BugReportData {
  description: string
  screenshotDataUrl?: string
}

export interface BugReportResult {
  success: boolean
  issueUrl?: string
  error?: string
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Git operations
  GIT_LIST_WORKTREES: 'git:list-worktrees',
  GIT_ADD_WORKTREE: 'git:add-worktree',
  GIT_REMOVE_WORKTREE: 'git:remove-worktree',
  GIT_IS_REPOSITORY: 'git:is-repository',
  GIT_GET_BRANCHES: 'git:get-branches',
  GIT_GET_DEFAULT_BRANCH: 'git:get-default-branch',

  // Agent operations
  AGENT_CREATE_SESSION: 'agent:create-session',
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_ABORT: 'agent:abort',
  AGENT_GET_STATUS: 'agent:get-status',
  AGENT_REMOVE_SESSION: 'agent:remove-session',
  AGENT_CHECK_AUTH: 'agent:check-auth',
  AGENT_OPEN_LOGIN_TERMINAL: 'agent:open-login-terminal',

  // Agent events (main -> renderer)
  AGENT_MESSAGE: 'agent:message',
  AGENT_TOOL_CALL: 'agent:tool-call',
  AGENT_ERROR: 'agent:error',
  AGENT_USAGE: 'agent:usage',

  // Dialog
  SHOW_OPEN_DIALOG: 'dialog:open',
  SHOW_CONFIRM_DIALOG: 'dialog:confirm',
  SHOW_ALERT_DIALOG: 'dialog:alert',

  // Bug report
  BUG_REPORT_SUBMIT: 'bug-report:submit',
} as const

// Electron API exposed via preload
export interface ElectronAPI {
  git: {
    listWorktrees: (repoPath: string) => Promise<Worktree[]>
    addWorktree: (repoPath: string, branch: string, baseBranch?: string) => Promise<void>
    removeWorktree: (repoPath: string, worktreePath: string) => Promise<void>
    isGitRepository: (path: string) => Promise<boolean>
    getBranches: (repoPath: string) => Promise<string[]>
    getDefaultBranch: (repoPath: string) => Promise<string>
  }
  agent: {
    createSession: (worktreeId: string, cwd: string) => Promise<void>
    sendMessage: (worktreeId: string, message: string) => Promise<void>
    abort: (worktreeId: string) => Promise<void>
    getStatus: (worktreeId: string) => Promise<SessionStatus>
    removeSession: (worktreeId: string) => Promise<void>
    checkAuth: () => Promise<AuthStatus>
    openLoginTerminal: () => Promise<void>
  }
  dialog: {
    confirm: (message: string, title?: string) => Promise<boolean>
    alert: (message: string, title?: string) => Promise<void>
  }
  bugReport: {
    submit: (data: BugReportData) => Promise<BugReportResult>
  }
  onAgentMessage: (callback: (worktreeId: string, message: Message) => void) => () => void
  onAgentToolCall: (callback: (worktreeId: string, toolCall: ToolCall) => void) => () => void
  onAgentError: (callback: (worktreeId: string, error: string) => void) => () => void
  onAgentUsage: (callback: (worktreeId: string, usage: UsageStats) => void) => () => void
  showOpenDialog: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
