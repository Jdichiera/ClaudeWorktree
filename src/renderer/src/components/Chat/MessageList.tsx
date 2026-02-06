import { useEffect, useRef, useCallback } from 'react'
import { Message } from './Message'
import type { Message as MessageType } from '../../types'

interface MessageListProps {
  messages: MessageType[]
}

export function MessageList({ messages }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // Check if user is at the bottom of the scroll
  const checkIfAtBottom = useCallback(() => {
    if (!listRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    // Consider "at bottom" if within 50px of the bottom
    return scrollHeight - scrollTop - clientHeight < 50
  }, [])

  // Handle scroll events to track if user is at bottom
  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIfAtBottom()
  }, [checkIfAtBottom])

  // Auto-scroll to bottom when new messages arrive, but only if already at bottom
  useEffect(() => {
    if (listRef.current && isAtBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // When messages array length changes (new message added), scroll to bottom
  const prevLengthRef = useRef(messages.length)
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      // New message added, scroll to bottom
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
        isAtBottomRef.current = true
      }
    }
    prevLengthRef.current = messages.length
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="message-list">
        <div className="empty-state" style={{ height: 'auto', flex: 1 }}>
          <div className="empty-state-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <h3>Start a conversation</h3>
          <p>Send a message to Claude to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="message-list" ref={listRef} onScroll={handleScroll}>
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </div>
  )
}
