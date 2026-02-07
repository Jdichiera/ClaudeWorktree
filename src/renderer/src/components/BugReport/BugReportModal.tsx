import { useState, useRef, useCallback } from 'react'
import type { BugReportResult } from '../../types'

interface BugReportModalProps {
  isOpen: boolean
  onClose: () => void
}

export function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  const [description, setDescription] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<BugReportResult | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = useCallback(() => {
    setDescription('')
    setScreenshotDataUrl(null)
    setIsSubmitting(false)
    setResult(null)
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [onClose, resetForm])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            if (dataUrl) {
              setScreenshotDataUrl(dataUrl)
            }
          }
          reader.readAsDataURL(file)
        }
        break
      }
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (dataUrl) {
        setScreenshotDataUrl(dataUrl)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const handleRemoveScreenshot = useCallback(() => {
    setScreenshotDataUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || isSubmitting) return

    setIsSubmitting(true)
    setResult(null)

    try {
      const submitResult = await window.electronAPI.bugReport.submit({
        description: description.trim(),
        screenshotDataUrl: screenshotDataUrl || undefined,
      })
      setResult(submitResult)

      if (submitResult.success) {
        // Auto-close after a brief delay on success
        setTimeout(() => {
          handleClose()
        }, 3000)
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit bug report',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [description, screenshotDataUrl, isSubmitting, handleClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit()
      }
    },
    [handleClose, handleSubmit]
  )

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose} onKeyDown={handleKeyDown}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Report a Bug</h2>
          <button className="btn-icon" onClick={handleClose} title="Close">
            <svg
              width="14"
              height="14"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 3L3 9M3 3L9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <label className="bug-report-label" htmlFor="bug-description">
            Describe the bug
          </label>
          <textarea
            id="bug-description"
            ref={textareaRef}
            className="bug-report-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onPaste={handlePaste}
            placeholder="What went wrong? Include steps to reproduce if possible..."
            rows={6}
            autoFocus
            disabled={isSubmitting}
          />

          <div className="bug-report-screenshot-section">
            <label className="bug-report-label">Screenshot (optional)</label>
            <p className="bug-report-hint">
              Paste from clipboard (Cmd+V) or choose a file
            </p>

            {screenshotDataUrl ? (
              <div className="bug-report-screenshot-preview">
                <img src={screenshotDataUrl} alt="Screenshot preview" />
                <button
                  className="btn-icon bug-report-remove-screenshot"
                  onClick={handleRemoveScreenshot}
                  title="Remove screenshot"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 3L3 9M3 3L9 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary bug-report-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17 8L12 3L7 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 3V15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Choose Image
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {result && (
            <div
              className={`bug-report-result ${result.success ? 'success' : 'error'}`}
            >
              {result.success ? (
                <>
                  Bug report submitted successfully!
                  {result.issueUrl && (
                    <a
                      href={result.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bug-report-link"
                    >
                      View issue
                    </a>
                  )}
                </>
              ) : (
                <span>{result.error}</span>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
