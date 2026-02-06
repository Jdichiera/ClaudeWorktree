import { ipcMain, dialog, BrowserWindow } from 'electron'
import { gitService } from '../services/git-service'
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

/**
 * Validate optional string parameter
 */
function validateOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${name}: must be a string if provided`)
  }
  return value || undefined
}

export function setupGitHandlers(): void {
  // Check if path is a git repository
  ipcMain.handle(IPC_CHANNELS.GIT_IS_REPOSITORY, async (_event, path: unknown) => {
    const validPath = validateString(path, 'path')
    return gitService.isGitRepository(validPath)
  })

  // List worktrees
  ipcMain.handle(IPC_CHANNELS.GIT_LIST_WORKTREES, async (_event, repoPath: unknown) => {
    const validPath = validateString(repoPath, 'repoPath')
    return gitService.listWorktrees(validPath)
  })

  // Add worktree
  ipcMain.handle(
    IPC_CHANNELS.GIT_ADD_WORKTREE,
    async (_event, repoPath: unknown, branch: unknown, baseBranch?: unknown) => {
      const validRepoPath = validateString(repoPath, 'repoPath')
      const validBranch = validateString(branch, 'branch')
      const validBaseBranch = validateOptionalString(baseBranch, 'baseBranch')
      await gitService.addWorktree(validRepoPath, validBranch, validBaseBranch)
      return { success: true }
    }
  )

  // Remove worktree
  ipcMain.handle(
    IPC_CHANNELS.GIT_REMOVE_WORKTREE,
    async (_event, repoPath: unknown, worktreePath: unknown) => {
      const validRepoPath = validateString(repoPath, 'repoPath')
      const validWorktreePath = validateString(worktreePath, 'worktreePath')
      await gitService.removeWorktree(validRepoPath, validWorktreePath)
      return { success: true }
    }
  )

  // Get branches
  ipcMain.handle(IPC_CHANNELS.GIT_GET_BRANCHES, async (_event, repoPath: unknown) => {
    const validPath = validateString(repoPath, 'repoPath')
    return gitService.getBranches(validPath)
  })

  // Get default branch
  ipcMain.handle(IPC_CHANNELS.GIT_GET_DEFAULT_BRANCH, async (_event, repoPath: unknown) => {
    const validPath = validateString(repoPath, 'repoPath')
    return gitService.getDefaultBranch(validPath)
  })

  // Open directory dialog
  ipcMain.handle(IPC_CHANNELS.SHOW_OPEN_DIALOG, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Git Repository',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    const isGitRepo = await gitService.isGitRepository(selectedPath)

    if (!isGitRepo) {
      throw new Error('Selected directory is not a git repository')
    }

    return selectedPath
  })

  // Show confirmation dialog
  ipcMain.handle(
    IPC_CHANNELS.SHOW_CONFIRM_DIALOG,
    async (_event, message: unknown, title?: unknown) => {
      const validMessage = validateString(message, 'message')
      const validTitle = validateOptionalString(title, 'title') || 'Confirm'

      const focusedWindow = BrowserWindow.getFocusedWindow()
      const options = {
        type: 'question' as const,
        buttons: ['Cancel', 'OK'],
        defaultId: 1,
        cancelId: 0,
        title: validTitle,
        message: validMessage,
      }

      const result = focusedWindow
        ? await dialog.showMessageBox(focusedWindow, options)
        : await dialog.showMessageBox(options)

      return result.response === 1
    }
  )

  // Show alert dialog
  ipcMain.handle(
    IPC_CHANNELS.SHOW_ALERT_DIALOG,
    async (_event, message: unknown, title?: unknown) => {
      const validMessage = validateString(message, 'message')
      const validTitle = validateOptionalString(title, 'title') || 'Alert'

      const focusedWindow = BrowserWindow.getFocusedWindow()
      const options = {
        type: 'info' as const,
        buttons: ['OK'],
        title: validTitle,
        message: validMessage,
      }

      if (focusedWindow) {
        await dialog.showMessageBox(focusedWindow, options)
      } else {
        await dialog.showMessageBox(options)
      }
    }
  )
}
