import { useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatPanel } from './components/Chat/ChatPanel'
import { ToolPanel } from './components/ToolPanel/ToolPanel'
import { useAppStore } from './stores/app-store'
import type { Message, ToolCall } from './types'

function App() {
  const selectedWorktreeId = useAppStore((state) => state.selectedWorktreeId)
  const handleAgentMessage = useAppStore((state) => state.handleAgentMessage)
  const handleAgentToolCall = useAppStore((state) => state.handleAgentToolCall)
  const handleAgentError = useAppStore((state) => state.handleAgentError)

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

  // Setup IPC event listeners
  useEffect(() => {
    const unsubMessage = window.electronAPI.onAgentMessage(onMessage)
    const unsubToolCall = window.electronAPI.onAgentToolCall(onToolCall)
    const unsubError = window.electronAPI.onAgentError(onError)

    return () => {
      unsubMessage()
      unsubToolCall()
      unsubError()
    }
  }, [onMessage, onToolCall, onError])

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
