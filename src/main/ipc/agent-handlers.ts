import { ipcMain, BrowserWindow } from 'electron'
import { agentManager } from '../services/agent-manager'
import { IPC_CHANNELS } from '@shared/types'

/**
 * Validate string parameter
 */
function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}: must be a non-empty string`)
  }
  return value
}

export function setupAgentHandlers(mainWindow: BrowserWindow): void {
  // Set the main window reference for event emission
  agentManager.setMainWindow(mainWindow)

  // Create session
  ipcMain.handle(
    IPC_CHANNELS.AGENT_CREATE_SESSION,
    async (_event, worktreeId: unknown, cwd: unknown) => {
      const validWorktreeId = validateString(worktreeId, 'worktreeId')
      const validCwd = validateString(cwd, 'cwd')
      await agentManager.createSession(validWorktreeId, validCwd)
      return { success: true }
    }
  )

  // Send message
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND_MESSAGE,
    async (_event, worktreeId: unknown, message: unknown) => {
      const validWorktreeId = validateString(worktreeId, 'worktreeId')
      const validMessage = validateString(message, 'message')
      await agentManager.sendMessage(validWorktreeId, validMessage)
      return { success: true }
    }
  )

  // Abort session
  ipcMain.handle(IPC_CHANNELS.AGENT_ABORT, async (_event, worktreeId: unknown) => {
    const validWorktreeId = validateString(worktreeId, 'worktreeId')
    await agentManager.abortSession(validWorktreeId)
    return { success: true }
  })

  // Get session status
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_STATUS, async (_event, worktreeId: unknown) => {
    const validWorktreeId = validateString(worktreeId, 'worktreeId')
    return agentManager.getSessionStatus(validWorktreeId)
  })

  // Remove session (for cleanup when repo is removed)
  ipcMain.handle(IPC_CHANNELS.AGENT_REMOVE_SESSION, async (_event, worktreeId: unknown) => {
    const validWorktreeId = validateString(worktreeId, 'worktreeId')
    await agentManager.removeSession(validWorktreeId)
    return { success: true }
  })

  // Check authentication status
  ipcMain.handle(IPC_CHANNELS.AGENT_CHECK_AUTH, async () => {
    return agentManager.checkAuth()
  })

  // Open terminal for login
  ipcMain.handle(IPC_CHANNELS.AGENT_OPEN_LOGIN_TERMINAL, async () => {
    agentManager.openLoginTerminal()
    return { success: true }
  })
}
