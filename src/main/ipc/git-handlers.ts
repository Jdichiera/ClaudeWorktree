import { ipcMain, dialog } from 'electron'
import { gitService } from '../services/git-service'
import { IPC_CHANNELS } from '@shared/types'

export function setupGitHandlers(): void {
  // Check if path is a git repository
  ipcMain.handle(IPC_CHANNELS.GIT_IS_REPOSITORY, async (_event, path: string) => {
    return gitService.isGitRepository(path)
  })

  // List worktrees
  ipcMain.handle(IPC_CHANNELS.GIT_LIST_WORKTREES, async (_event, repoPath: string) => {
    return gitService.listWorktrees(repoPath)
  })

  // Add worktree
  ipcMain.handle(
    IPC_CHANNELS.GIT_ADD_WORKTREE,
    async (_event, repoPath: string, branch: string, baseBranch?: string) => {
      await gitService.addWorktree(repoPath, branch, baseBranch)
    }
  )

  // Remove worktree
  ipcMain.handle(
    IPC_CHANNELS.GIT_REMOVE_WORKTREE,
    async (_event, repoPath: string, worktreePath: string) => {
      await gitService.removeWorktree(repoPath, worktreePath)
    }
  )

  // Get branches
  ipcMain.handle(IPC_CHANNELS.GIT_GET_BRANCHES, async (_event, repoPath: string) => {
    return gitService.getBranches(repoPath)
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
}
