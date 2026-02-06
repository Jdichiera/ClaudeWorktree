import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { accessSync, constants } from 'fs'
import type { SessionStatus, Message, ToolCall } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'

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

// Allowlist of safe environment variables to pass to Claude
const SAFE_ENV_VARS = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TERM',
  'TMPDIR',
  'XDG_RUNTIME_DIR',
]

/**
 * Create a sanitized environment object with only safe variables
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
 * Basic prompt sanitization - removes control characters
 */
function sanitizePrompt(prompt: string): string {
  // Remove control characters except newlines and tabs
  return prompt.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

export class AgentManager {
  private sessions: Map<string, AgentSession> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * Create a new agent session for a worktree
   */
  async createSession(worktreeId: string, cwd: string): Promise<void> {
    if (!worktreeId || typeof worktreeId !== 'string') {
      throw new Error('Invalid worktree ID')
    }

    if (!cwd || typeof cwd !== 'string') {
      throw new Error('Invalid working directory')
    }

    // Clean up existing session if any
    if (this.sessions.has(worktreeId)) {
      await this.abortSession(worktreeId)
    }

    this.sessions.set(worktreeId, {
      worktreeId,
      workingDirectory: cwd,
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

    const session = this.sessions.get(worktreeId)
    if (!session) {
      throw new Error(`No session found for worktree: ${worktreeId}`)
    }

    if (session.isProcessing) {
      throw new Error('Agent is already processing a message')
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
   * Find the claude CLI binary
   */
  private findClaudePath(): string {
    const homedir = process.env.HOME || ''
    const possiblePaths = [
      `${homedir}/.local/bin/claude`,
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ]

    for (const p of possiblePaths) {
      try {
        accessSync(p, constants.X_OK)
        return p
      } catch {
        continue
      }
    }

    // Fallback to just 'claude' and hope it's in PATH
    // But warn about it
    console.warn('Claude CLI not found in standard locations, falling back to PATH lookup')
    return 'claude'
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
      const claudePath = this.findClaudePath()

      console.log('Starting Claude agent in:', session.workingDirectory)
      console.log('Using Claude at:', claudePath)
      console.log('Prompt:', prompt.substring(0, 100))

      // Sanitize the prompt
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
        console.error('Claude stderr:', errText)
        // Also emit as part of the message for visibility
        if (errText.includes('Error:')) {
          assistantMessage.content += `\n[Error: ${errText}]`
          this.emitMessage(session.worktreeId, assistantMessage)
        }
      }

      const onClose = (code: number | null) => {
        console.log('Claude process closed with code:', code)
        console.log('Response content length:', assistantMessage.content.length)
        cleanup()
        session.process = null
        assistantMessage.isStreaming = false
        this.emitMessage(session.worktreeId, assistantMessage)

        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Claude process exited with code ${code}`))
        }
      }

      const onError = (error: Error) => {
        cleanup()
        session.process = null
        reject(error)
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
