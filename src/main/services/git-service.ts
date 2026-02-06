import { exec } from 'child_process'
import { promisify } from 'util'
import { basename } from 'path'
import type { Worktree } from '@shared/types'

const execAsync = promisify(exec)

export class GitService {
  /**
   * Check if a path is a git repository
   */
  async isGitRepository(path: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: path })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the root directory of a git repository
   */
  async getRepoRoot(path: string): Promise<string> {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: path })
    return stdout.trim()
  }

  /**
   * List all worktrees for a repository
   */
  async listWorktrees(repoPath: string): Promise<Worktree[]> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath })
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
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: worktreePath })
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }

  /**
   * Add a new worktree
   */
  async addWorktree(repoPath: string, branch: string, baseBranch?: string): Promise<void> {
    const worktreePath = `${repoPath}/../${basename(repoPath)}-${branch}`

    let command: string
    if (baseBranch) {
      // Create new branch from base
      command = `git worktree add -b ${branch} "${worktreePath}" ${baseBranch}`
    } else {
      // Check out existing branch
      command = `git worktree add "${worktreePath}" ${branch}`
    }

    try {
      await execAsync(command, { cwd: repoPath })
    } catch (error) {
      // If branch doesn't exist, try creating it
      if (!baseBranch) {
        const createCommand = `git worktree add -b ${branch} "${worktreePath}"`
        await execAsync(createCommand, { cwd: repoPath })
      } else {
        throw error
      }
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    // First try normal remove
    try {
      await execAsync(`git worktree remove "${worktreePath}"`, { cwd: repoPath })
    } catch {
      // If that fails, try force remove
      await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: repoPath })
    }

    // Prune worktree references
    await execAsync('git worktree prune', { cwd: repoPath })
  }

  /**
   * Get list of local branches
   */
  async getBranches(repoPath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch --format="%(refname:short)"', { cwd: repoPath })
      return stdout
        .trim()
        .split('\n')
        .filter((b) => b.length > 0)
    } catch {
      return []
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath })
      return stdout.trim()
    } catch {
      return 'unknown'
    }
  }
}

// Singleton instance
export const gitService = new GitService()
