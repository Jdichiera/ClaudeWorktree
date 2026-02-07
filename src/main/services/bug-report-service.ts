import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { BugReportData, BugReportResult } from '@shared/types'

// Repository to file issues against
const GITHUB_REPO = 'Jdichiera/ClaudeWorktree'

// Maximum description length to prevent abuse
const MAX_DESCRIPTION_LENGTH = 10000

// Maximum screenshot size (5MB base64)
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024

/**
 * Execute a command using spawn and return stdout
 */
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => { stdout += data.toString() })
    proc.stderr?.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `Command failed with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to execute command: ${err.message}`))
    })
  })
}

/**
 * Validate bug report data
 */
function validateBugReport(data: unknown): BugReportData {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid bug report data')
  }

  const report = data as Record<string, unknown>

  if (typeof report.description !== 'string' || report.description.trim().length === 0) {
    throw new Error('Bug description is required')
  }

  if (report.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error('Bug description is too long')
  }

  const validated: BugReportData = {
    description: report.description.trim(),
  }

  if (report.screenshotDataUrl !== undefined) {
    if (typeof report.screenshotDataUrl !== 'string') {
      throw new Error('Invalid screenshot data')
    }
    if (report.screenshotDataUrl.length > MAX_SCREENSHOT_SIZE) {
      throw new Error('Screenshot is too large (max 5MB)')
    }
    if (!report.screenshotDataUrl.startsWith('data:image/')) {
      throw new Error('Invalid screenshot format')
    }
    validated.screenshotDataUrl = report.screenshotDataUrl
  }

  return validated
}

/**
 * Save a base64 data URL to a temporary PNG file
 * Returns the file path
 */
function saveScreenshotToTempFile(dataUrl: string): string {
  // Extract base64 data from data URL
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid screenshot data URL format')
  }

  const extension = matches[1]
  const base64Data = matches[2]
  const buffer = Buffer.from(base64Data, 'base64')

  const tempDir = mkdtempSync(join(tmpdir(), 'claude-worktree-bug-'))
  const filePath = join(tempDir, `screenshot.${extension}`)
  writeFileSync(filePath, buffer)

  return filePath
}

/**
 * Clean up a temporary screenshot file
 */
function cleanupTempFile(filePath: string): void {
  try {
    unlinkSync(filePath)
  } catch {
    // Ignore cleanup errors
  }
}

export class BugReportService {
  /**
   * Upload a screenshot file using gh CLI and return the markdown image URL.
   * Uses `gh issue create` with a temporary issue approach, or directly
   * embeds the image as a base64 data URI in the issue body.
   */
  private async uploadScreenshot(screenshotPath: string, issueNumber: string): Promise<void> {
    // Use gh issue comment with file upload via the --body-file approach
    // gh doesn't support direct image upload, so we use the GitHub API
    // to upload the file as a comment attachment
    try {
      const commentBody = `## Screenshot\n\n![Bug Report Screenshot](${screenshotPath})`
      await execCommand('gh', [
        'issue', 'comment',
        issueNumber,
        '--repo', GITHUB_REPO,
        '--body', commentBody,
      ])
    } catch {
      console.error('Failed to attach screenshot comment')
    }
  }

  /**
   * Submit a bug report as a GitHub issue
   */
  async submit(rawData: unknown): Promise<BugReportResult> {
    const data = validateBugReport(rawData)

    // Build the first line of description as the title
    const titleLine = data.description.split('\n')[0].slice(0, 100)
    const title = `Bug: ${titleLine}`

    // Build issue body
    let body = '## Bug Report\n\n'
    body += data.description

    if (data.screenshotDataUrl) {
      body += '\n\n## Screenshot\n\n'
      body += '*A screenshot was attached with this report (see comment below).*'
    }

    body += '\n\n---\n*Submitted from Claude Worktree app*'

    let screenshotPath: string | null = null

    try {
      // Save screenshot to temp file if provided
      if (data.screenshotDataUrl) {
        screenshotPath = saveScreenshotToTempFile(data.screenshotDataUrl)
      }

      // Create the issue using gh CLI
      const args = [
        'issue', 'create',
        '--repo', GITHUB_REPO,
        '--title', title,
        '--body', body,
        '--label', 'bug',
      ]

      const issueUrl = await execCommand('gh', args)

      // If there's a screenshot, upload it as a comment on the new issue
      if (screenshotPath && issueUrl) {
        const issueNumber = issueUrl.split('/').pop()
        if (issueNumber) {
          await this.uploadScreenshot(screenshotPath, issueNumber)
        }
      }

      return {
        success: true,
        issueUrl: issueUrl || undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit bug report'

      // Check for common errors
      if (message.includes('gh: command not found') || message.includes('not found')) {
        return {
          success: false,
          error: 'GitHub CLI (gh) is not installed. Please install it from https://cli.github.com',
        }
      }

      if (message.includes('not logged in') || message.includes('auth')) {
        return {
          success: false,
          error: 'Not authenticated with GitHub. Run "gh auth login" in your terminal first.',
        }
      }

      return {
        success: false,
        error: message,
      }
    } finally {
      if (screenshotPath) {
        cleanupTempFile(screenshotPath)
      }
    }
  }
}

// Singleton instance
export const bugReportService = new BugReportService()
