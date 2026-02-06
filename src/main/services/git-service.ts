import { spawn } from 'child_process'
import { basename } from 'path'
import { existsSync } from 'fs'
import type { Worktree } from '@shared/types'

/**
 * Validate branch name to prevent command injection
 * Only allows alphanumeric, hyphens, underscores, and forward slashes
 */
function isValidBranchName(branch: string): boolean {
  return /^[a-zA-Z0-9_\-/]+$/.test(branch) && !branch.includes('..')
}

/**
 * Validate path to prevent path traversal attacks
 */
function isValidPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  // Normalize and check for traversal attempts
  const normalized = path.replace(/\/+/g, '/')
  return !normalized.includes('..') && path.length > 0
}

/**
 * Execute a git command using spawn (safer than exec)
 */
function gitSpawn(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    process.stdout?.on('data', (data) => { stdout += data.toString() })
    process.stderr?.on('data', (data) => { stderr += data.toString() })

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `git command failed with code ${code}`))
      }
    })

    process.on('error', reject)
  })
}

export class GitService {
  /**
   * Check if a path is a git repository
   */
  async isGitRepository(path: string): Promise<boolean> {
    if (!isValidPath(path)) return false

    try {
      await gitSpawn(['rev-parse', '--git-dir'], path)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the root directory of a git repository
   */
  async getRepoRoot(path: string): Promise<string> {
    if (!isValidPath(path)) {
      throw new Error('Invalid path provided')
    }

    const stdout = await gitSpawn(['rev-parse', '--show-toplevel'], path)
    return stdout.trim()
  }

  /**
   * List all worktrees for a repository
   */
  async listWorktrees(repoPath: string): Promise<Worktree[]> {
    if (!isValidPath(repoPath)) {
      console.error('Invalid repository path:', repoPath)
      return []
    }

    try {
      const stdout = await gitSpawn(['worktree', 'list', '--porcelain'], repoPath)
      const worktrees = this.parseWorktreeOutput(stdout)

      // Check for uncommitted changes in each worktree
      const worktreesWithStatus = await Promise.all(
        worktrees.map(async (wt) => ({
          ...wt,
          hasChanges: await this.hasUncommittedChanges(wt.path),
        }))
      )

      return worktreesWithStatus
    } catch (error) {
      console.error('Failed to list worktrees:', error)
      return []
    }
  }

  /**
   * Parse git worktree list --porcelain output
   */
  private parseWorktreeOutput(output: string): Worktree[] {
    const worktrees: Worktree[] = []
    const entries = output.trim().split('\n\n')

    for (const entry of entries) {
      if (!entry.trim()) continue

      const lines = entry.split('\n')
      let path = ''
      let branch = ''
      let isBare = false

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.substring(9)
        } else if (line.startsWith('branch refs/heads/')) {
          branch = line.substring(18)
        } else if (line === 'bare') {
          isBare = true
        } else if (line === 'detached') {
          branch = 'detached HEAD'
        }
      }

      if (path && !isBare) {
        worktrees.push({
          id: this.generateWorktreeId(path),
          path,
          branch: branch || 'unknown',
          isMain: worktrees.length === 0, // First worktree is main
          hasChanges: false, // Will be updated after
        })
      }
    }

    return worktrees
  }

  /**
   * Generate a unique ID for a worktree
   */
  private generateWorktreeId(path: string): string {
    return Buffer.from(path).toString('base64').replace(/[/+=]/g, '_')
  }

  /**
   * Check if a worktree has uncommitted changes
   */
  async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
    if (!isValidPath(worktreePath)) return false

    try {
      const stdout = await gitSpawn(['status', '--porcelain'], worktreePath)
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }

  /**
   * Get the default branch name (main or master)
   */
  async getDefaultBranch(repoPath: string): Promise<string> {
    if (!isValidPath(repoPath)) return 'main'

    try {
      // Try to get the default branch from remote
      const stdout = await gitSpawn(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], repoPath)
      const branch = stdout.trim().replace('origin/', '')
      return branch || 'main'
    } catch {
      // Fallback: check if 'main' or 'master' exists
      try {
        await gitSpawn(['rev-parse', '--verify', 'main'], repoPath)
        return 'main'
      } catch {
        try {
          await gitSpawn(['rev-parse', '--verify', 'master'], repoPath)
          return 'master'
        } catch {
          return 'main'
        }
      }
    }
  }

  /**
   * Add a new worktree
   */
  async addWorktree(repoPath: string, branch: string, baseBranch?: string): Promise<void> {
    if (!isValidPath(repoPath)) {
      throw new Error('Invalid repository path')
    }

    if (!isValidBranchName(branch)) {
      throw new Error('Invalid branch name. Use only alphanumeric characters, hyphens, underscores, and forward slashes.')
    }

    if (baseBranch && !isValidBranchName(baseBranch)) {
      throw new Error('Invalid base branch name')
    }

    // Sanitize branch for path (replace slashes with dashes)
    const safeBranchForPath = branch.replace(/\//g, '-')
    const worktreePath = `${repoPath}/../${basename(repoPath)}-${safeBranchForPath}`

    // Ensure the worktree path doesn't already exist
    if (existsSync(worktreePath)) {
      throw new Error(`Worktree path already exists: ${worktreePath}`)
    }

    try {
      if (baseBranch) {
        // Create new branch from base
        await gitSpawn(['worktree', 'add', '-b', branch, worktreePath, baseBranch], repoPath)
      } else {
        // Check out existing branch
        await gitSpawn(['worktree', 'add', worktreePath, branch], repoPath)
      }
    } catch (error) {
      // If branch doesn't exist, try creating it
      if (!baseBranch && error instanceof Error && error.message.includes('invalid reference')) {
        await gitSpawn(['worktree', 'add', '-b', branch, worktreePath], repoPath)
      } else {
        throw error
      }
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    if (!isValidPath(repoPath)) {
      throw new Error('Invalid repository path')
    }

    if (!isValidPath(worktreePath)) {
      throw new Error('Invalid worktree path')
    }

    // First try normal remove
    try {
      await gitSpawn(['worktree', 'remove', worktreePath], repoPath)
    } catch {
      // If that fails, try force remove
      await gitSpawn(['worktree', 'remove', '--force', worktreePath], repoPath)
    }

    // Prune worktree references
    try {
      await gitSpawn(['worktree', 'prune'], repoPath)
    } catch (error) {
      console.error('Failed to prune worktrees:', error)
    }
  }

  /**
   * Get list of local branches
   */
  async getBranches(repoPath: string): Promise<string[]> {
    if (!isValidPath(repoPath)) {
      console.error('Invalid repository path for getBranches:', repoPath)
      return []
    }

    try {
      const stdout = await gitSpawn(['branch', '--format=%(refname:short)'], repoPath)
      return stdout
        .trim()
        .split('\n')
        .filter((b) => b.length > 0)
    } catch (error) {
      console.error('Failed to get branches:', error)
      return []
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    if (!isValidPath(repoPath)) return 'unknown'

    try {
      const stdout = await gitSpawn(['branch', '--show-current'], repoPath)
      return stdout.trim()
    } catch {
      return 'unknown'
    }
  }
}

// Singleton instance
export const gitService = new GitService()
