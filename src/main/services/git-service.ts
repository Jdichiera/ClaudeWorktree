import { spawn } from 'child_process'
import { basename, resolve, normalize, dirname } from 'path'
import { existsSync, realpathSync } from 'fs'
import type { Worktree } from '@shared/types'

// Maximum branch name length to prevent DoS
const MAX_BRANCH_LENGTH = 100

// Track known repository paths for validation
const knownRepoPaths = new Set<string>()

/**
 * Validate branch name to prevent command injection
 * Only allows alphanumeric, hyphens, underscores, and forward slashes
 */
function isValidBranchName(branch: string): boolean {
  if (!branch || typeof branch !== 'string') return false
  if (branch.length > MAX_BRANCH_LENGTH) return false
  return /^[a-zA-Z0-9_\-/]+$/.test(branch) && !branch.includes('..')
}

/**
 * Resolve path to its real path (following symlinks) if it exists,
 * otherwise resolve parent directories that exist
 */
function resolveRealPath(inputPath: string): string {
  const normalized = normalize(resolve(inputPath))

  // If path exists, resolve it fully
  if (existsSync(normalized)) {
    try {
      return realpathSync(normalized)
    } catch {
      return normalized
    }
  }

  // Path doesn't exist - resolve the parent and append the basename
  const parent = dirname(normalized)
  const base = basename(normalized)

  if (existsSync(parent)) {
    try {
      return resolve(realpathSync(parent), base)
    } catch {
      return normalized
    }
  }

  return normalized
}

/**
 * Validate and normalize path to prevent traversal attacks
 * Returns the normalized absolute path if valid, null otherwise
 */
function validatePath(inputPath: string, allowedBasePath?: string): string | null {
  // Basic type and content checks
  if (!inputPath || typeof inputPath !== 'string') return null
  if (inputPath.length === 0 || inputPath.length > 4096) return null

  // Check for null bytes (common injection technique)
  if (inputPath.includes('\0')) return null

  // Check for URL-encoded traversal attempts
  if (inputPath.includes('%2e') || inputPath.includes('%2E')) return null
  if (inputPath.includes('%2f') || inputPath.includes('%2F')) return null

  try {
    // Resolve to absolute path and normalize, following symlinks
    const resolvedPath = resolveRealPath(inputPath)

    // If we have a base path restriction, ensure the resolved path is within it
    if (allowedBasePath) {
      const resolvedBase = resolveRealPath(allowedBasePath)

      // Ensure path stays within the allowed base
      if (!resolvedPath.startsWith(resolvedBase + '/') && resolvedPath !== resolvedBase) {
        return null
      }
    }

    return resolvedPath
  } catch {
    return null
  }
}

/**
 * Legacy isValidPath for backward compatibility - use validatePath instead
 */
function isValidPath(path: string): boolean {
  return validatePath(path) !== null
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
    const validPath = validatePath(path)
    if (!validPath) return false

    try {
      await gitSpawn(['rev-parse', '--git-dir'], validPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the root directory of a git repository
   */
  async getRepoRoot(path: string): Promise<string> {
    const validPath = validatePath(path)
    if (!validPath) {
      throw new Error('Invalid path provided')
    }

    const stdout = await gitSpawn(['rev-parse', '--show-toplevel'], validPath)
    const repoRoot = stdout.trim()

    // Track this as a known repo path
    knownRepoPaths.add(repoRoot)

    return repoRoot
  }

  /**
   * List all worktrees for a repository
   */
  async listWorktrees(repoPath: string): Promise<Worktree[]> {
    const validPath = validatePath(repoPath)
    if (!validPath) {
      console.error('Invalid repository path')
      return []
    }

    try {
      // Get the actual repo root and track it
      const repoRoot = await this.getRepoRoot(validPath)
      knownRepoPaths.add(repoRoot)

      const stdout = await gitSpawn(['worktree', 'list', '--porcelain'], validPath)
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
    const validPath = validatePath(worktreePath)
    if (!validPath) return false

    try {
      const stdout = await gitSpawn(['status', '--porcelain'], validPath)
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }

  /**
   * Get the default branch name (main or master)
   */
  async getDefaultBranch(repoPath: string): Promise<string> {
    const validPath = validatePath(repoPath)
    if (!validPath) return 'main'

    try {
      // Try to get the default branch from remote
      const stdout = await gitSpawn(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], validPath)
      const branch = stdout.trim().replace('origin/', '')
      return branch || 'main'
    } catch {
      // Fallback: check if 'main' or 'master' exists
      try {
        await gitSpawn(['rev-parse', '--verify', 'main'], validPath)
        return 'main'
      } catch {
        try {
          await gitSpawn(['rev-parse', '--verify', 'master'], validPath)
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
    const validRepoPath = validatePath(repoPath)
    if (!validRepoPath) {
      throw new Error('Invalid repository path')
    }

    if (!isValidBranchName(branch)) {
      throw new Error('Invalid branch name. Use only alphanumeric characters, hyphens, underscores, and forward slashes (max 100 chars).')
    }

    if (baseBranch && !isValidBranchName(baseBranch)) {
      throw new Error('Invalid base branch name')
    }

    // Get the parent directory of the repo for worktree placement
    const repoParentDir = dirname(validRepoPath)
    const repoName = basename(validRepoPath)

    // Sanitize branch for path (replace slashes with dashes)
    const safeBranchForPath = branch.replace(/\//g, '-')

    // Construct worktree path in the same parent directory as the repo
    const worktreeName = `${repoName}-${safeBranchForPath}`
    const worktreePath = resolve(repoParentDir, worktreeName)

    // Validate the final worktree path is within the repo parent directory
    const validWorktreePath = validatePath(worktreePath, repoParentDir)
    if (!validWorktreePath) {
      throw new Error('Invalid worktree path - path traversal detected')
    }

    // Ensure the worktree path doesn't already exist
    if (existsSync(validWorktreePath)) {
      throw new Error(`Worktree path already exists: ${validWorktreePath}`)
    }

    try {
      if (baseBranch) {
        // Create new branch from base
        await gitSpawn(['worktree', 'add', '-b', branch, validWorktreePath, baseBranch], validRepoPath)
      } else {
        // Check out existing branch
        await gitSpawn(['worktree', 'add', validWorktreePath, branch], validRepoPath)
      }
    } catch (error) {
      // If branch doesn't exist, try creating it
      if (!baseBranch && error instanceof Error && error.message.includes('invalid reference')) {
        await gitSpawn(['worktree', 'add', '-b', branch, validWorktreePath], validRepoPath)
      } else {
        throw error
      }
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    const validRepoPath = validatePath(repoPath)
    if (!validRepoPath) {
      throw new Error('Invalid repository path')
    }

    const validWorktreePath = validatePath(worktreePath)
    if (!validWorktreePath) {
      throw new Error('Invalid worktree path')
    }

    // Verify the worktree belongs to this repo by checking git's worktree list
    const worktrees = await this.listWorktrees(validRepoPath)
    const isValidWorktree = worktrees.some(wt => {
      const wtPath = validatePath(wt.path)
      return wtPath === validWorktreePath
    })

    if (!isValidWorktree) {
      throw new Error('Worktree does not belong to this repository')
    }

    // First try normal remove
    try {
      await gitSpawn(['worktree', 'remove', validWorktreePath], validRepoPath)
    } catch {
      // If that fails, try force remove
      await gitSpawn(['worktree', 'remove', '--force', validWorktreePath], validRepoPath)
    }

    // Prune worktree references
    try {
      await gitSpawn(['worktree', 'prune'], validRepoPath)
    } catch (error) {
      console.error('Failed to prune worktrees:', error)
    }
  }

  /**
   * Get list of local branches
   */
  async getBranches(repoPath: string): Promise<string[]> {
    const validPath = validatePath(repoPath)
    if (!validPath) {
      console.error('Invalid repository path for getBranches')
      return []
    }

    try {
      const stdout = await gitSpawn(['branch', '--format=%(refname:short)'], validPath)
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
    const validPath = validatePath(repoPath)
    if (!validPath) return 'unknown'

    try {
      const stdout = await gitSpawn(['branch', '--show-current'], validPath)
      return stdout.trim()
    } catch {
      return 'unknown'
    }
  }

  /**
   * Check if a path is a known worktree path
   */
  isKnownWorktreePath(path: string): boolean {
    const validPath = validatePath(path)
    if (!validPath) return false

    // Check against known repo paths
    for (const repoPath of knownRepoPaths) {
      if (validPath.startsWith(repoPath + '/') || validPath === repoPath) {
        return true
      }
      // Also check sibling directories (worktrees are created as siblings)
      const repoParent = dirname(repoPath)
      if (validPath.startsWith(repoParent + '/')) {
        return true
      }
    }
    return false
  }
}

// Singleton instance
export const gitService = new GitService()
