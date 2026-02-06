import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatPanel } from './components/Chat/ChatPanel'
import { ToolPanel } from './components/ToolPanel/ToolPanel'
import { useAppStore } from './stores/app-store'

function App() {
  const { selectedWorktreeId, handleAgentMessage, handleAgentToolCall, handleAgentError } =
    useAppStore()

  // Setup IPC event listeners
  useEffect(() => {
    const unsubMessage = window.electronAPI.onAgentMessage((worktreeId, message) => {
      handleAgentMessage(worktreeId, message)
    })

    const unsubToolCall = window.electronAPI.onAgentToolCall((worktreeId, toolCall) => {
      handleAgentToolCall(worktreeId, toolCall)
    })

    const unsubError = window.electronAPI.onAgentError((worktreeId, error) => {
      handleAgentError(worktreeId, error)
    })

    return () => {
      unsubMessage()
      unsubToolCall()
      unsubError()
    }
  }, [handleAgentMessage, handleAgentToolCall, handleAgentError])

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
