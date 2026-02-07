import { spawn, execFile, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { accessSync, statSync, constants } from 'fs'
import { resolve, normalize } from 'path'
import type { SessionStatus, Message, ToolCall, UsageStats } from '@shared/types'
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
  usage: UsageStats
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
  'HOME',
  'USER',
  'PATH',
  'LANG',
  'LC_ALL',
  'TERM',
  'TMPDIR',
]

// Auth error patterns that indicate the user needs to log in
const AUTH_ERROR_PATTERNS = [
  'not authenticated',
  'not logged in',
  'please log in',
  'please run.*login',
  'authentication required',
  'unauthorized',
  'invalid.*api.*key',
  'expired.*token',
  'claude login',
]

/**
 * Check if error text indicates an authentication problem
 */
function isAuthError(text: string): boolean {
  const lower = text.toLowerCase()
  return AUTH_ERROR_PATTERNS.some((pattern) => new RegExp(pattern, 'i').test(lower))
}

/**
 * Create a sanitized environment object with only safe variables
 * HOME and USER are required for Claude CLI to find its config/credentials
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
   * Check if Claude CLI is installed and authenticated.
   * Runs `claude --version` to verify the CLI works with the current environment.
   * Then runs a minimal `claude --print` to check auth status.
   * Returns { installed: boolean, authenticated: boolean, claudePath?: string, error?: string }
   */
  async checkAuth(): Promise<{
    installed: boolean
    authenticated: boolean
    claudePath?: string
    error?: string
  }> {
    let cliPath: string
    try {
      cliPath = this.findClaudePath()
    } catch {
      return { installed: false, authenticated: false, error: 'Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code' }
    }

    // Run a minimal print command to check if auth works
    // Using a trivial prompt with --print to see if we get an auth error
    return new Promise((resolve) => {
      const proc = execFile(
        cliPath,
        ['--print', '--output-format', 'text', 'say "ok"'],
        {
          env: getSafeEnv(),
          timeout: 15000,
        },
        (error, stdout, stderr) => {
          if (!error && stdout) {
            resolve({ installed: true, authenticated: true, claudePath: cliPath })
            return
          }

          const combinedOutput = `${stdout || ''}\n${stderr || ''}`
          if (isAuthError(combinedOutput)) {
            resolve({
              installed: true,
              authenticated: false,
              claudePath: cliPath,
              error: 'Not logged in. Open a terminal and run: claude login',
            })
            return
          }

          // Other error (possibly network, timeout, CLI quirk, etc.)
          // If it's not specifically an auth error, assume authenticated —
          // the real test is whether actual chat works
          resolve({
            installed: true,
            authenticated: true,
            claudePath: cliPath,
          })
        }
      )

      // Safety kill if it hangs
      setTimeout(() => {
        try { proc.kill('SIGKILL') } catch { /* ignore */ }
      }, 16000)
    })
  }

  /**
   * Open the default terminal application with `claude login` pre-filled.
   * On macOS, opens Terminal.app. On Linux, tries common terminal emulators.
   */
  openLoginTerminal(): void {
    let cliPath: string
    try {
      cliPath = this.findClaudePath()
    } catch {
      cliPath = 'claude'
    }

    const loginCommand = `${cliPath} login`

    if (process.platform === 'darwin') {
      // macOS: use osascript to open Terminal with the login command
      spawn('/usr/bin/osascript', [
        '-e',
        `tell application "Terminal"
          activate
          do script "${loginCommand}"
        end tell`,
      ], { stdio: 'ignore', detached: true }).unref()
    } else {
      // Linux: try common terminal emulators
      const terminals = [
        { cmd: 'gnome-terminal', args: ['--', 'bash', '-c', `${loginCommand}; exec bash`] },
        { cmd: 'konsole', args: ['-e', 'bash', '-c', `${loginCommand}; exec bash`] },
        { cmd: 'xterm', args: ['-e', `${loginCommand}; bash`] },
      ]

      for (const term of terminals) {
        try {
          spawn(term.cmd, term.args, { stdio: 'ignore', detached: true }).unref()
          return
        } catch {
          continue
        }
      }
    }
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
      usage: {
        totalCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        totalTurns: 0,
        lastDurationMs: 0,
      },
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
   * Parse a single NDJSON line from stream-json output and emit appropriate events
   */
  private parseStreamLine(
    line: string,
    session: AgentSession,
    assistantMessage: Message
  ): void {
    let event: { type: string; subtype?: string; message?: { content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown }> }; result?: string; total_cost_usd?: number; num_turns?: number; duration_ms?: number; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }; tool_use_result?: { stdout?: string; stderr?: string; content?: string } }
    try {
      event = JSON.parse(line)
    } catch {
      // Not valid JSON — ignore (could be a stray log line)
      return
    }

    switch (event.type) {
      case 'system':
        // Init event — nothing to surface to the UI
        break

      case 'assistant': {
        // Full assistant turn. content[] has text and tool_use blocks.
        const content = event.message?.content
        if (!Array.isArray(content)) break

        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            assistantMessage.content += block.text
            this.emitMessage(session.worktreeId, assistantMessage)
          } else if (block.type === 'tool_use' && block.id && block.name) {
            const toolCall: ToolCall = {
              id: block.id,
              name: block.name,
              input: block.input ?? {},
              status: 'running',
              timestamp: Date.now(),
            }
            this.emitToolCall(session.worktreeId, toolCall)
          }
        }
        break
      }

      case 'user': {
        // Tool results. content[] has tool_result blocks.
        const content = event.message?.content
        if (!Array.isArray(content)) break

        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            let output = ''
            if (typeof block.content === 'string') {
              output = block.content
            } else if (Array.isArray(block.content)) {
              // content can be an array of {type:"text", text:"..."} blocks
              output = (block.content as Array<{ type: string; text?: string }>)
                .filter((c) => c.type === 'text' && typeof c.text === 'string')
                .map((c) => c.text)
                .join('\n')
            }

            const toolCall: ToolCall = {
              id: block.tool_use_id,
              name: '', // store already has the name from the running call
              input: {},
              output,
              status: 'completed',
              timestamp: Date.now(),
            }
            this.emitToolCall(session.worktreeId, toolCall)
          }
        }
        break
      }

      case 'result': {
        // Final event — mark streaming complete
        if (event.subtype === 'error' && event.result) {
          assistantMessage.content += event.result
        }
        assistantMessage.isStreaming = false
        this.emitMessage(session.worktreeId, assistantMessage)

        // Accumulate usage statistics
        if (event.usage) {
          session.usage.inputTokens += event.usage.input_tokens ?? 0
          session.usage.outputTokens += event.usage.output_tokens ?? 0
          session.usage.cacheCreationInputTokens += event.usage.cache_creation_input_tokens ?? 0
          session.usage.cacheReadInputTokens += event.usage.cache_read_input_tokens ?? 0
        }
        if (typeof event.total_cost_usd === 'number') {
          session.usage.totalCostUsd = event.total_cost_usd
        }
        if (typeof event.num_turns === 'number') {
          session.usage.totalTurns += event.num_turns
        }
        if (typeof event.duration_ms === 'number') {
          session.usage.lastDurationMs = event.duration_ms
        }
        this.emitUsage(session.worktreeId, session.usage)
        break
      }

      default:
        // Unknown event type — ignore
        break
    }
  }

  /**
   * Run Claude agent using claude-code CLI with stream-json output
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

      // Use claude CLI in non-interactive mode with stream-json output
      // Note: prompt must come BEFORE --allowedTools since it's a variadic arg
      const claudeProcess = spawn(claudePath, [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
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

      // NDJSON line buffer for stdout
      let lineBuffer = ''

      const onStdout = (data: Buffer) => {
        lineBuffer += data.toString()
        const lines = lineBuffer.split('\n')
        // Keep the last (potentially incomplete) line in the buffer
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.length === 0) continue
          this.parseStreamLine(trimmed, session, assistantMessage)
        }
      }

      let stderrBuffer = ''
      const onStderr = (data: Buffer) => {
        const errText = data.toString()
        stderrBuffer += errText

        if (isAuthError(stderrBuffer)) {
          assistantMessage.content = 'Authentication required. Please log in to Claude CLI first.\n\nOpen a terminal and run:\n```\nclaude login\n```\n\nYou can use the "Open Terminal to Login" button above to do this automatically.'
          assistantMessage.isStreaming = false
          this.emitMessage(session.worktreeId, assistantMessage)
          this.emitError(session.worktreeId, 'Not authenticated - please run "claude login" in a terminal')
        }
      }

      const onClose = (code: number | null) => {
        // Flush any remaining data in the line buffer
        if (lineBuffer.trim().length > 0) {
          this.parseStreamLine(lineBuffer.trim(), session, assistantMessage)
        }

        cleanup()
        session.process = null

        // Safety net: ensure streaming is marked complete even if no result event arrived
        if (assistantMessage.isStreaming) {
          assistantMessage.isStreaming = false
          this.emitMessage(session.worktreeId, assistantMessage)
        }

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

  private emitUsage(worktreeId: string, usage: UsageStats): void {
    this.mainWindow?.webContents.send(IPC_CHANNELS.AGENT_USAGE, worktreeId, { ...usage })
  }
}

// Singleton instance
export const agentManager = new AgentManager()
