import { ipcMain, BrowserWindow } from 'electron'
import { agentManager } from '../services/agent-manager'
import { IPC_CHANNELS } from '@shared/types'

export function setupAgentHandlers(mainWindow: BrowserWindow): void {
  // Set the main window reference for event emission
  agentManager.setMainWindow(mainWindow)

  // Create session
  ipcMain.handle(
    IPC_CHANNELS.AGENT_CREATE_SESSION,
    async (_event, worktreeId: string, cwd: string) => {
      await agentManager.createSession(worktreeId, cwd)
    }
  )

  // Send message
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND_MESSAGE,
    async (_event, worktreeId: string, message: string) => {
      await agentManager.sendMessage(worktreeId, message)
    }
  )

  // Abort session
  ipcMain.handle(IPC_CHANNELS.AGENT_ABORT, async (_event, worktreeId: string) => {
    await agentManager.abortSession(worktreeId)
  })

  // Get session status
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_STATUS, async (_event, worktreeId: string) => {
    return agentManager.getSessionStatus(worktreeId)
  })
}
