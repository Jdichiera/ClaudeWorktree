import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

let electronApp: ElectronApplication
let window: Page
let testRepoPath: string

// Helper to create a test git repository
function createTestRepo(): string {
  const tempDir = `/tmp/test-repo-${Date.now()}`
  fs.mkdirSync(tempDir, { recursive: true })

  execSync('git init', { cwd: tempDir })
  execSync('git config user.email "test@test.com"', { cwd: tempDir })
  execSync('git config user.name "Test User"', { cwd: tempDir })

  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repository\n')
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ name: 'test-repo', version: '1.0.0' }, null, 2)
  )

  execSync('git add .', { cwd: tempDir })
  execSync('git commit -m "Initial commit"', { cwd: tempDir })

  return tempDir
}

// Helper to cleanup test repository
function cleanupTestRepo(repoPath: string): void {
  try {
    fs.rmSync(repoPath, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

test.beforeAll(async () => {
  // Create test repository
  testRepoPath = createTestRepo()

  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
  cleanupTestRepo(testRepoPath)
})

test.describe('Agent Integration', () => {
  test.skip('can open repository and see worktrees', async () => {
    // Mock the dialog to return test repo path
    await electronApp.evaluate(
      ({ dialog }, repoPath) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [repoPath],
        })
      },
      testRepoPath
    )

    // Click open repository button
    await window.getByRole('button', { name: /open repository/i }).click()

    // Wait for worktrees to load
    await expect(window.getByText('main')).toBeVisible({ timeout: 5000 })
  })

  test.skip('can send message and receive response', async () => {
    // This test requires Claude CLI to be installed and configured
    // Skip in CI environments without proper setup

    // Select a worktree first (assuming repo is already loaded)
    await window.getByText('main').click()

    // Type a message
    await window.getByRole('textbox').fill('What files are in this directory?')

    // Send the message
    await window.getByRole('button', { name: /send/i }).click()

    // Wait for response (with generous timeout for API call)
    await expect(window.getByTestId('message-assistant')).toBeVisible({
      timeout: 60000,
    })
  })

  test.skip('tool calls appear in side panel', async () => {
    // Assumes previous test has run and agent is ready

    await window.getByRole('textbox').fill('Read the package.json file')
    await window.getByRole('button', { name: /send/i }).click()

    // Wait for tool panel to show the file read
    await expect(window.getByTestId('tool-panel')).toContainText('package.json', {
      timeout: 60000,
    })
  })

  test.skip('can abort agent while processing', async () => {
    // Send a message that will take a while
    await window.getByRole('textbox').fill('List all files recursively')
    await window.getByRole('button', { name: /send/i }).click()

    // Wait for processing indicator
    await expect(window.getByText('Processing...')).toBeVisible({ timeout: 5000 })

    // Click stop button
    await window.getByRole('button', { name: /stop/i }).click()

    // Processing should stop
    await expect(window.getByText('Processing...')).not.toBeVisible({ timeout: 5000 })
  })
})
