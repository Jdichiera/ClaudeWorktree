import { GitService } from '../../../src/main/services/git-service'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

describe('GitService', () => {
  let gitService: GitService
  let testRepoPath: string

  beforeAll(async () => {
    gitService = new GitService()

    // Create a test git repository
    testRepoPath = `/tmp/git-service-test-${Date.now()}`
    fs.mkdirSync(testRepoPath, { recursive: true })

    await execAsync('git init', { cwd: testRepoPath })
    await execAsync('git config user.email "test@test.com"', { cwd: testRepoPath })
    await execAsync('git config user.name "Test User"', { cwd: testRepoPath })

    fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test')
    await execAsync('git add .', { cwd: testRepoPath })
    await execAsync('git commit -m "Initial commit"', { cwd: testRepoPath })
  })

  afterAll(() => {
    // Cleanup
    try {
      fs.rmSync(testRepoPath, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('isGitRepository', () => {
    it('should return true for a git repository', async () => {
      const result = await gitService.isGitRepository(testRepoPath)
      expect(result).toBe(true)
    })

    it('should return false for a non-git directory', async () => {
      const result = await gitService.isGitRepository('/tmp')
      expect(result).toBe(false)
    })

    it('should return false for a non-existent path', async () => {
      const result = await gitService.isGitRepository('/nonexistent/path')
      expect(result).toBe(false)
    })
  })

  describe('listWorktrees', () => {
    it('should list worktrees in a repository', async () => {
      const worktrees = await gitService.listWorktrees(testRepoPath)

      expect(worktrees).toHaveLength(1)
      // macOS resolves /tmp to /private/tmp, so we need to handle both
      expect(worktrees[0].path).toMatch(new RegExp(`(\/private)?${testRepoPath}$`))
      expect(worktrees[0].isMain).toBe(true)
    })

    it('should return empty array for non-git directory', async () => {
      const worktrees = await gitService.listWorktrees('/tmp')
      expect(worktrees).toEqual([])
    })
  })

  describe('getBranches', () => {
    it('should list branches in a repository', async () => {
      const branches = await gitService.getBranches(testRepoPath)

      expect(branches.length).toBeGreaterThan(0)
      // Default branch should be either 'main' or 'master'
      expect(branches.some((b) => b === 'main' || b === 'master')).toBe(true)
    })
  })

  describe('hasUncommittedChanges', () => {
    it('should return false for a clean repository', async () => {
      const hasChanges = await gitService.hasUncommittedChanges(testRepoPath)
      expect(hasChanges).toBe(false)
    })

    it('should return true when there are uncommitted changes', async () => {
      // Create an uncommitted change
      fs.writeFileSync(path.join(testRepoPath, 'new-file.txt'), 'content')

      const hasChanges = await gitService.hasUncommittedChanges(testRepoPath)
      expect(hasChanges).toBe(true)

      // Cleanup
      fs.unlinkSync(path.join(testRepoPath, 'new-file.txt'))
    })
  })

  describe('addWorktree and removeWorktree', () => {
    it('should add and remove a worktree', async () => {
      const branch = 'test-branch'

      // Add worktree
      await gitService.addWorktree(testRepoPath, branch)

      // Verify it was added
      let worktrees = await gitService.listWorktrees(testRepoPath)
      expect(worktrees.length).toBe(2)
      expect(worktrees.some((w) => w.branch === branch)).toBe(true)

      // Find the new worktree path
      const newWorktree = worktrees.find((w) => w.branch === branch)
      expect(newWorktree).toBeDefined()

      // Remove worktree
      await gitService.removeWorktree(testRepoPath, newWorktree!.path)

      // Verify it was removed
      worktrees = await gitService.listWorktrees(testRepoPath)
      expect(worktrees.length).toBe(1)
    })
  })
})
