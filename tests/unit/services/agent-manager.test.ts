import type { Message, ToolCall } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'

// Mock electron before importing AgentManager
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
}))

// Mock git-service
jest.mock('../../../src/main/services/git-service', () => ({
  gitService: {
    isKnownWorktreePath: jest.fn().mockReturnValue(true),
  },
}))

import { AgentManager } from '../../../src/main/services/agent-manager'

/**
 * Helper to create a minimal AgentSession-shaped object for parseStreamLine.
 * We only need worktreeId since parseStreamLine reads it for emitting.
 */
function makeSession(worktreeId = 'wt-1') {
  return {
    worktreeId,
    workingDirectory: '/tmp/test',
    process: null,
    isProcessing: true,
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
  }
}

function makeAssistantMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
    ...overrides,
  }
}

describe('AgentManager — parseStreamLine', () => {
  let manager: AgentManager
  let sendSpy: jest.Mock

  beforeEach(() => {
    manager = new AgentManager()
    sendSpy = jest.fn()
    manager.setMainWindow({
      webContents: { send: sendSpy },
    } as any)
  })

  it('ignores system events', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc', tools: [], model: 'claude' })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).not.toHaveBeenCalled()
    expect(msg.content).toBe('')
    expect(msg.isStreaming).toBe(true)
  })

  it('appends text from assistant event', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello, world!' },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(msg.content).toBe('Hello, world!')
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_MESSAGE,
      'wt-1',
      expect.objectContaining({ content: 'Hello, world!' })
    )
  })

  it('accumulates text across multiple assistant events', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()

    ;(manager as any).parseStreamLine(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'First. ' }] } }),
      session, msg
    )
    ;(manager as any).parseStreamLine(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Second.' }] } }),
      session, msg
    )

    expect(msg.content).toBe('First. Second.')
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })

  it('emits tool_use as a running ToolCall', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-123',
            name: 'Read',
            input: { file_path: '/tmp/foo.txt' },
          },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL,
      'wt-1',
      expect.objectContaining({
        id: 'tool-123',
        name: 'Read',
        input: { file_path: '/tmp/foo.txt' },
        status: 'running',
      })
    )
  })

  it('handles assistant event with mixed text and tool_use blocks', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me read that file.' },
          { type: 'tool_use', id: 'tool-456', name: 'Read', input: { file_path: '/a.txt' } },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(msg.content).toBe('Let me read that file.')
    expect(sendSpy).toHaveBeenCalledTimes(2) // one message emit, one tool call emit
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_MESSAGE, 'wt-1', expect.anything()
    )
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL, 'wt-1',
      expect.objectContaining({ id: 'tool-456', name: 'Read', status: 'running' })
    )
  })

  it('emits completed ToolCall from user tool_result with string content', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tool-123', content: 'file contents here' },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL,
      'wt-1',
      expect.objectContaining({
        id: 'tool-123',
        output: 'file contents here',
        status: 'completed',
      })
    )
  })

  it('emits completed ToolCall from user tool_result with array content', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-789',
            content: [
              { type: 'text', text: 'line one' },
              { type: 'text', text: 'line two' },
            ],
          },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL,
      'wt-1',
      expect.objectContaining({
        id: 'tool-789',
        output: 'line one\nline two',
        status: 'completed',
      })
    )
  })

  it('handles result event with success — marks streaming false', () => {
    const session = makeSession()
    const msg = makeAssistantMessage({ content: 'Some response' })
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Some response',
      total_cost_usd: 0.01,
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(msg.isStreaming).toBe(false)
    expect(msg.content).toBe('Some response') // unchanged on success
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_MESSAGE,
      'wt-1',
      expect.objectContaining({ isStreaming: false })
    )
  })

  it('handles result event with error — appends error text and marks streaming false', () => {
    const session = makeSession()
    const msg = makeAssistantMessage({ content: '' })
    const line = JSON.stringify({
      type: 'result',
      subtype: 'error',
      result: 'Rate limit exceeded',
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(msg.isStreaming).toBe(false)
    expect(msg.content).toBe('Rate limit exceeded')
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_MESSAGE,
      'wt-1',
      expect.objectContaining({ content: 'Rate limit exceeded', isStreaming: false })
    )
  })

  it('ignores invalid JSON lines', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()

    ;(manager as any).parseStreamLine('not json at all', session, msg)
    ;(manager as any).parseStreamLine('{broken json', session, msg)
    ;(manager as any).parseStreamLine('', session, msg)

    expect(sendSpy).not.toHaveBeenCalled()
    expect(msg.content).toBe('')
  })

  it('ignores unknown event types', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({ type: 'something_new', data: {} })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('handles assistant event with missing message.content gracefully', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()

    // No message field
    ;(manager as any).parseStreamLine(JSON.stringify({ type: 'assistant' }), session, msg)
    // message but no content
    ;(manager as any).parseStreamLine(JSON.stringify({ type: 'assistant', message: {} }), session, msg)
    // content is not an array
    ;(manager as any).parseStreamLine(JSON.stringify({ type: 'assistant', message: { content: 'string' } }), session, msg)

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('handles user event with missing message.content gracefully', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()

    ;(manager as any).parseStreamLine(JSON.stringify({ type: 'user' }), session, msg)
    ;(manager as any).parseStreamLine(JSON.stringify({ type: 'user', message: {} }), session, msg)

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('handles tool_use with missing input — defaults to empty object', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'tool-no-input', name: 'Bash' },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL,
      'wt-1',
      expect.objectContaining({
        id: 'tool-no-input',
        name: 'Bash',
        input: {},
      })
    )
  })

  it('skips tool_use blocks missing id or name', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()

    // Missing name
    ;(manager as any).parseStreamLine(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x' }] } }),
      session, msg
    )
    // Missing id
    ;(manager as any).parseStreamLine(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }),
      session, msg
    )

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('handles multiple tool results in a single user event', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line = JSON.stringify({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tool-a', content: 'output a' },
          { type: 'tool_result', tool_use_id: 'tool-b', content: 'output b' },
        ],
      },
    })

    ;(manager as any).parseStreamLine(line, session, msg)

    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL, 'wt-1',
      expect.objectContaining({ id: 'tool-a', output: 'output a' })
    )
    expect(sendSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TOOL_CALL, 'wt-1',
      expect.objectContaining({ id: 'tool-b', output: 'output b' })
    )
  })
})

describe('AgentManager — NDJSON line buffering', () => {
  // These tests simulate the onStdout handler's line-buffer behavior
  // by feeding chunked Buffer data and verifying parseStreamLine gets
  // called with complete lines.

  let manager: AgentManager
  let sendSpy: jest.Mock
  let parseSpy: jest.SpyInstance

  beforeEach(() => {
    manager = new AgentManager()
    sendSpy = jest.fn()
    manager.setMainWindow({
      webContents: { send: sendSpy },
    } as any)
    parseSpy = jest.spyOn(manager as any, 'parseStreamLine')
  })

  afterEach(() => {
    parseSpy.mockRestore()
  })

  /**
   * Simulates the onStdout logic from runClaudeAgent.
   * We replicate the buffer/split logic here since onStdout is a closure
   * inside a private method and can't be called directly.
   */
  function simulateStdout(chunks: string[], session: any, msg: Message) {
    let lineBuffer = ''
    for (const chunk of chunks) {
      lineBuffer += chunk
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) continue
        ;(manager as any).parseStreamLine(trimmed, session, msg)
      }
    }
    // Flush remaining (simulating onClose)
    if (lineBuffer.trim().length > 0) {
      ;(manager as any).parseStreamLine(lineBuffer.trim(), session, msg)
    }
  }

  it('handles a complete line in a single chunk', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const event = JSON.stringify({ type: 'system', subtype: 'init' })

    simulateStdout([event + '\n'], session, msg)

    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledWith(event, session, msg)
  })

  it('handles a line split across two chunks', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } })
    const half = Math.floor(event.length / 2)

    simulateStdout([
      event.slice(0, half),
      event.slice(half) + '\n',
    ], session, msg)

    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledWith(event, session, msg)
  })

  it('handles multiple lines in a single chunk', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line1 = JSON.stringify({ type: 'system', subtype: 'init' })
    const line2 = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } })

    simulateStdout([line1 + '\n' + line2 + '\n'], session, msg)

    expect(parseSpy).toHaveBeenCalledTimes(2)
    expect(parseSpy).toHaveBeenCalledWith(line1, session, msg)
    expect(parseSpy).toHaveBeenCalledWith(line2, session, msg)
  })

  it('flushes incomplete final line on close', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const event = JSON.stringify({ type: 'result', subtype: 'success', result: 'done' })

    // No trailing newline — simulates process exiting mid-write
    simulateStdout([event], session, msg)

    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledWith(event, session, msg)
  })

  it('skips empty lines between events', () => {
    const session = makeSession()
    const msg = makeAssistantMessage()
    const line1 = JSON.stringify({ type: 'system', subtype: 'init' })
    const line2 = JSON.stringify({ type: 'result', subtype: 'success', result: '' })

    simulateStdout([line1 + '\n\n\n' + line2 + '\n'], session, msg)

    expect(parseSpy).toHaveBeenCalledTimes(2)
  })
})
