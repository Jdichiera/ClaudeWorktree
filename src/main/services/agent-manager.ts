import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
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
        require('fs').accessSync(p, require('fs').constants.X_OK)
        return p
      } catch {
        continue
      }
    }

    // Fallback to just 'claude' and hope it's in PATH
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

      // Use claude CLI in non-interactive mode with text output
      // Note: prompt must come BEFORE --allowedTools since it's a variadic arg
      const claudeProcess = spawn(claudePath, [
        '--print',
        '--output-format', 'text',
        prompt,
        '--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep',
      ], {
        cwd: session.workingDirectory,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Close stdin immediately - Claude doesn't need input in --print mode
      claudeProcess.stdin?.end()

      session.process = claudeProcess

      claudeProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        assistantMessage.content += text
        this.emitMessage(session.worktreeId, assistantMessage)
      })

      claudeProcess.stderr?.on('data', (data: Buffer) => {
        const errText = data.toString()
        console.error('Claude stderr:', errText)
        // Also emit as part of the message for visibility
        if (errText.includes('Error:')) {
          assistantMessage.content += `\n[Error: ${errText}]`
          this.emitMessage(session.worktreeId, assistantMessage)
        }
      })

      claudeProcess.on('close', (code) => {
        console.log('Claude process closed with code:', code)
        console.log('Response content length:', assistantMessage.content.length)
        session.process = null
        assistantMessage.isStreaming = false
        this.emitMessage(session.worktreeId, assistantMessage)

        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Claude process exited with code ${code}`))
        }
      })

      claudeProcess.on('error', (error) => {
        session.process = null
        reject(error)
      })
    })
  }

  /**
   * Handle streaming events from Claude agent
   */
  private handleAgentEvent(
    session: AgentSession,
    event: Record<string, unknown>,
    assistantMessage: Message
  ): void {
    switch (event.type) {
      case 'assistant':
        // Handle assistant message content
        if (event.message && typeof event.message === 'object') {
          const msg = event.message as { content?: Array<{ type: string; text?: string }> }
          if (msg.content) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                assistantMessage.content = block.text
                this.emitMessage(session.worktreeId, assistantMessage)
              }
            }
          }
        }
        break

      case 'tool_use':
        // Handle tool calls
        const toolCall: ToolCall = {
          id: (event.id as string) || randomUUID(),
          name: (event.name as string) || 'unknown',
          input: (event.input as Record<string, unknown>) || {},
          status: 'running',
          timestamp: Date.now(),
        }
        this.emitToolCall(session.worktreeId, toolCall)
        break

      case 'tool_result':
        // Handle tool results
        const resultToolCall: ToolCall = {
          id: (event.tool_use_id as string) || randomUUID(),
          name: 'tool_result',
          input: {},
          output: typeof event.content === 'string' ? event.content : JSON.stringify(event.content),
          status: event.is_error ? 'error' : 'completed',
          timestamp: Date.now(),
        }
        this.emitToolCall(session.worktreeId, resultToolCall)
        break

      case 'result':
        // Final result
        if (event.result && typeof event.result === 'string') {
          assistantMessage.content = event.result
          this.emitMessage(session.worktreeId, assistantMessage)
        }
        break
    }
  }

  /**
   * Abort the current agent session
   */
  async abortSession(worktreeId: string): Promise<void> {
    const session = this.sessions.get(worktreeId)
    if (!session) return

    if (session.process) {
      session.process.kill('SIGTERM')
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
