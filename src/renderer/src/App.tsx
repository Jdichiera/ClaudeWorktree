import { useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatPanel } from './components/Chat/ChatPanel'
import { ToolPanel } from './components/ToolPanel/ToolPanel'
import { useAppStore } from './stores/app-store'
import type { Message, ToolCall, UsageStats } from './types'

function App() {
  const selectedWorktreeId = useAppStore((state) => state.selectedWorktreeId)
  const handleAgentMessage = useAppStore((state) => state.handleAgentMessage)
  const handleAgentToolCall = useAppStore((state) => state.handleAgentToolCall)
  const handleAgentError = useAppStore((state) => state.handleAgentError)
  const handleAgentUsage = useAppStore((state) => state.handleAgentUsage)

  // Memoize callbacks to prevent unnecessary re-subscriptions
  const onMessage = useCallback(
    (worktreeId: string, message: Message) => {
      handleAgentMessage(worktreeId, message)
    },
    [handleAgentMessage]
  )

  const onToolCall = useCallback(
    (worktreeId: string, toolCall: ToolCall) => {
      handleAgentToolCall(worktreeId, toolCall)
    },
    [handleAgentToolCall]
  )

  const onError = useCallback(
    (worktreeId: string, error: string) => {
      handleAgentError(worktreeId, error)
    },
    [handleAgentError]
  )

  const onUsage = useCallback(
    (worktreeId: string, usage: UsageStats) => {
      handleAgentUsage(worktreeId, usage)
    },
    [handleAgentUsage]
  )

  // Setup IPC event listeners
  useEffect(() => {
    const unsubMessage = window.electronAPI.onAgentMessage(onMessage)
    const unsubToolCall = window.electronAPI.onAgentToolCall(onToolCall)
    const unsubError = window.electronAPI.onAgentError(onError)
    const unsubUsage = window.electronAPI.onAgentUsage(onUsage)

    return () => {
      unsubMessage()
      unsubToolCall()
      unsubError()
      unsubUsage()
    }
  }, [onMessage, onToolCall, onError, onUsage])

  return (
    <div className="app">
      <Sidebar />
      <div className="main-content">
        <ChatPanel />
      </div>
      {selectedWorktreeId && <ToolPanel />}
    </div>
  )
}

export default App
