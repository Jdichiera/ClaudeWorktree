import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, Message, ToolCall } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'

const electronAPI: ElectronAPI = {
  git: {
    listWorktrees: (repoPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_LIST_WORKTREES, repoPath),

    addWorktree: (repoPath: string, branch: string, baseBranch?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_ADD_WORKTREE, repoPath, branch, baseBranch),

    removeWorktree: (repoPath: string, worktreePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOVE_WORKTREE, repoPath, worktreePath),

    isGitRepository: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_IS_REPOSITORY, path),

    getBranches: (repoPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_BRANCHES, repoPath),

    getDefaultBranch: (repoPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_DEFAULT_BRANCH, repoPath),
  },

  agent: {
    createSession: (worktreeId: string, cwd: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_CREATE_SESSION, worktreeId, cwd),

    sendMessage: (worktreeId: string, message: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, worktreeId, message),

    abort: (worktreeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_ABORT, worktreeId),

    getStatus: (worktreeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_STATUS, worktreeId),

    removeSession: (worktreeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_REMOVE_SESSION, worktreeId),
  },

  dialog: {
    confirm: (message: string, title?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHOW_CONFIRM_DIALOG, message, title),

    alert: (message: string, title?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHOW_ALERT_DIALOG, message, title),
  },

  onAgentMessage: (callback: (worktreeId: string, message: Message) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, worktreeId: string, message: Message) => {
      callback(worktreeId, message)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_MESSAGE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_MESSAGE, handler)
    }
  },

  onAgentToolCall: (callback: (worktreeId: string, toolCall: ToolCall) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, worktreeId: string, toolCall: ToolCall) => {
      callback(worktreeId, toolCall)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_TOOL_CALL, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_TOOL_CALL, handler)
    }
  },

  onAgentError: (callback: (worktreeId: string, error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, worktreeId: string, error: string) => {
      callback(worktreeId, error)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_ERROR, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_ERROR, handler)
    }
  },

  showOpenDialog: () => ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
