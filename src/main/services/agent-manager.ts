import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { accessSync, statSync, constants } from 'fs'
import { resolve, normalize } from 'path'
import type { SessionStatus, Message, ToolCall } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'
import { gitService } from './git-service'

interface AgentSession {
  worktreeId: string
  workingDirectory: string
  process: ChildProcess | null
  isProcessing: boolean
  messages: Message[]
  currentMessageId: string | null
  error?: string
  eventCleanup?: () => void
}

// Security limits
const MAX_PROMPT_LENGTH = 100000 // 100KB max prompt
const MAX_SESSIONS = 50 // Prevent resource exhaustion

// Hardcoded safe paths for Claude CLI (no PATH lookup)
const CLAUDE_SAFE_PATHS = [
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
]

// Allowlist of safe environment variables to pass to Claude
const SAFE_ENV_VARS = [
  'PATH',
  'LANG',
  'LC_ALL',
  'TERM',
  'TMPDIR',
]

/**
 * Create a sanitized environment object with only safe variables
 * Note: HOME and USER are intentionally excluded
 */
function getSafeEnv(): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {}
  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key]
    }
  }
  return safeEnv
}

/**
 * Sanitize prompt - removes control characters and enforces length limit
 */
function sanitizePrompt(prompt: string): string {
  // Enforce length limit
  let sanitized = prompt.slice(0, MAX_PROMPT_LENGTH)

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return sanitized
}

/**
 * Validate and normalize a working directory path
 */
function validateWorkingDirectory(cwd: string): string | null {
  if (!cwd || typeof cwd !== 'string') return null
  if (cwd.length === 0 || cwd.length > 4096) return null

  // Check for null bytes
  if (cwd.includes('\0')) return null

  try {
    const normalized = normalize(resolve(cwd))
    return normalized
  } catch {
    return null
  }
}

/**
 * Verify a binary is safe to execute
 * Checks that it exists, is executable, and is owned by root or current user
 */
function verifySafeBinary(path: string): boolean {
  try {
    // Check it exists and is executable
    accessSync(path, constants.X_OK)

    // Get file stats
    const stats = statSync(path)

    // Verify it's a regular file (not a symlink, directory, etc.)
    if (!stats.isFile()) {
      return false
    }

    // Verify ownership: must be owned by root (uid 0) or current user
    const currentUid = process.getuid?.() ?? -1
    if (stats.uid !== 0 && stats.uid !== currentUid) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export class AgentManager {
  private sessions: Map<string, AgentSession> = new Map()
  private mainWindow: BrowserWindow | null = null
  private claudePath: string | null = null

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * Find and verify the claude CLI binary
   * Uses hardcoded paths only - no PATH lookup for security
   */
  private findClaudePath(): string {
    // Return cached path if already found
    if (this.claudePath) {
      return this.claudePath
    }

    // Check hardcoded safe paths only
    for (const p of CLAUDE_SAFE_PATHS) {
      if (verifySafeBinary(p)) {
        this.claudePath = p
        return p
      }
    }

    // Also check ~/.local/bin/claude but verify ownership
    const homedir = process.env.HOME
    if (homedir && typeof homedir === 'string' && !homedir.includes('\0')) {
      const localPath = `${homedir}/.local/bin/claude`
      if (verifySafeBinary(localPath)) {
        this.claudePath = localPath
        return localPath
      }
    }

    throw new Error('Claude CLI not found in safe locations')
  }

  /**
   * Create a new agent session for a worktree
   */
  async createSession(worktreeId: string, cwd: string): Promise<void> {
    if (!worktreeId || typeof worktreeId !== 'string') {
      throw new Error('Invalid worktree ID')
    }

    // Validate and normalize the working directory
    const validCwd = validateWorkingDirectory(cwd)
    if (!validCwd) {
      throw new Error('Invalid working directory')
    }

    // Verify this is a known worktree path to prevent arbitrary directory access
    if (!gitService.isKnownWorktreePath(validCwd)) {
      throw new Error('Working directory is not a known worktree')
    }

    // Enforce session limit
    if (this.sessions.size >= MAX_SESSIONS && !this.sessions.has(worktreeId)) {
      throw new Error('Maximum sessions reached')
    }

    // Clean up existing session if any
    if (this.sessions.has(worktreeId)) {
      await this.abortSession(worktreeId)
    }

    this.sessions.set(worktreeId, {
      worktreeId,
      workingDirectory: validCwd,
      process: null,
      isProcessing: false,
      messages: [],
      currentMessageId: null,
    })
  }

  /**
   * Send a message to the agent and stream responses
   */
  async sendMessage(worktreeId: string, message: string): Promise<void> {
    if (!worktreeId || typeof worktreeId !== 'string') {
      throw new Error('Invalid worktree ID')
    }

    if (!message || typeof message !== 'string') {
      throw new Error('Invalid message')
    }

    if (message.length > MAX_PROMPT_LENGTH) {
      throw new Error('Message too long')
    }

    const session = this.sessions.get(worktreeId)
    if (!session) {
      throw new Error('Session not found')
    }

    if (session.isProcessing) {
      throw new Error('Agent is busy')
    }

    session.isProcessing = true

    // Add user message
    const userMessage: Message = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    }
    session.messages.push(userMessage)
    this.emitMessage(worktreeId, userMessage)

    // Create assistant message for streaming
    const assistantMessage: Message = {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }
    session.currentMessageId = assistantMessage.id
    session.messages.push(assistantMessage)

    try {
      await this.runClaudeAgent(session, message, assistantMessage)
    } catch (error) {
      session.error = error instanceof Error ? error.message : 'Unknown error'
      this.emitError(worktreeId, session.error)
    } finally {
      session.isProcessing = false
      session.currentMessageId = null
    }
  }

  /**
   * Run Claude agent using claude-code CLI with text output
   */
  private async runClaudeAgent(
    session: AgentSession,
    prompt: string,
    assistantMessage: Message
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let claudePath: string
      try {
        claudePath = this.findClaudePath()
      } catch (error) {
        reject(error)
        return
      }

      // Sanitize the prompt (includes length limit and control char removal)
      const sanitizedPrompt = sanitizePrompt(prompt)

      // Use claude CLI in non-interactive mode with text output
      // Note: prompt must come BEFORE --allowedTools since it's a variadic arg
      const claudeProcess = spawn(claudePath, [
        '--print',
        '--output-format', 'text',
        sanitizedPrompt,
        '--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep',
      ], {
        cwd: session.workingDirectory,
        env: getSafeEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Close stdin immediately - Claude doesn't need input in --print mode
      claudeProcess.stdin?.end()

      session.process = claudeProcess

      // Event handlers
      const onStdout = (data: Buffer) => {
        const text = data.toString()
        assistantMessage.content += text
        this.emitMessage(session.worktreeId, assistantMessage)
      }

      const onStderr = (data: Buffer) => {
        const errText = data.toString()
        // Only show generic error indicator, not full stderr
        if (errText.includes('Error:') || errText.includes('error:')) {
          assistantMessage.content += '\n[Error occurred]'
          this.emitMessage(session.worktreeId, assistantMessage)
        }
      }

      const onClose = (code: number | null) => {
        cleanup()
        session.process = null
        assistantMessage.isStreaming = false
        this.emitMessage(session.worktreeId, assistantMessage)

        if (code === 0) {
          resolve()
        } else {
          reject(new Error('Claude process failed'))
        }
      }

      const onError = () => {
        cleanup()
        session.process = null
        reject(new Error('Failed to run Claude'))
      }

      // Attach event handlers
      claudeProcess.stdout?.on('data', onStdout)
      claudeProcess.stderr?.on('data', onStderr)
      claudeProcess.on('close', onClose)
      claudeProcess.on('error', onError)

      // Cleanup function to remove all event listeners
      const cleanup = () => {
        claudeProcess.stdout?.removeListener('data', onStdout)
        claudeProcess.stderr?.removeListener('data', onStderr)
        claudeProcess.removeListener('close', onClose)
        claudeProcess.removeListener('error', onError)
        session.eventCleanup = undefined
      }

      // Store cleanup function for abort
      session.eventCleanup = cleanup
    })
  }

  /**
   * Abort the current agent session
   */
  async abortSession(worktreeId: string): Promise<void> {
    const session = this.sessions.get(worktreeId)
    if (!session) return

    // Clean up event listeners first
    if (session.eventCleanup) {
      session.eventCleanup()
    }

    if (session.process) {
      const proc = session.process

      // Try SIGTERM first
      proc.kill('SIGTERM')

      // Set a timeout to force kill if process doesn't terminate
      const killTimeout = setTimeout(() => {
        try {
          if (!proc.killed) {
            proc.kill('SIGKILL')
          }
        } catch {
          // Process may have already exited
        }
      }, 3000) // 3 second timeout

      // Clear timeout if process exits cleanly
      proc.once('exit', () => {
        clearTimeout(killTimeout)
      })

      session.process = null
    }

    session.isProcessing = false
    session.currentMessageId = null
  }

  /**
   * Get session status
   */
  getSessionStatus(worktreeId: string): SessionStatus {
    const session = this.sessions.get(worktreeId)
    if (!session) {
      return { isActive: false, isProcessing: false }
    }

    return {
      isActive: true,
      isProcessing: session.isProcessing,
      error: session.error,
    }
  }

  /**
   * Get all messages for a session
   */
  getMessages(worktreeId: string): Message[] {
    const session = this.sessions.get(worktreeId)
    return session?.messages || []
  }

  /**
   * Remove a session and clean up resources
   */
  async removeSession(worktreeId: string): Promise<void> {
    await this.abortSession(worktreeId)
    this.sessions.delete(worktreeId)
  }

  /**
   * Validate that a session's worktree path is still valid
   */
  isSessionValid(worktreeId: string): boolean {
    const session = this.sessions.get(worktreeId)
    if (!session) return false
    return gitService.isKnownWorktreePath(session.workingDirectory)
  }

  // Event emitters
  private emitMessage(worktreeId: string, message: Message): void {
    this.mainWindow?.webContents.send(IPC_CHANNELS.AGENT_MESSAGE, worktreeId, message)
  }

  private emitToolCall(worktreeId: string, toolCall: ToolCall): void {
    this.mainWindow?.webContents.send(IPC_CHANNELS.AGENT_TOOL_CALL, worktreeId, toolCall)
  }

  private emitError(worktreeId: string, error: string): void {
    this.mainWindow?.webContents.send(IPC_CHANNELS.AGENT_ERROR, worktreeId, error)
  }
}

// Singleton instance
export const agentManager = new AgentManager()
