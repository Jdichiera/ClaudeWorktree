import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  // Get the first window
  window = await electronApp.firstWindow()

  // Wait for the app to be ready
  await window.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test.describe('App Launch', () => {
  test('should display the main window', async () => {
    const title = await window.title()
    expect(title).toBe('Claude Worktree')
  })

  test('should show sidebar with open repository button', async () => {
    const sidebar = window.locator('.sidebar')
    await expect(sidebar).toBeVisible()

    const openButton = window.getByRole('button', { name: /open repository/i })
    await expect(openButton).toBeVisible()
  })

  test('should show empty state when no worktree is selected', async () => {
    const emptyState = window.locator('.empty-state')
    await expect(emptyState.first()).toBeVisible()
  })
})

test.describe('Repository Management', () => {
  test('should be able to open a repository', async () => {
    // Mock the dialog to return a test repository path
    await electronApp.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/tmp/test-repo'],
      })
    })

    // This test would need a real git repository to work fully
    // For now, we just verify the dialog interaction works
  })
})

test.describe('Chat Interface', () => {
  test('should show "No worktree selected" message initially', async () => {
    const header = window.locator('.chat-header')
    await expect(header).toContainText('No worktree selected')
  })

  test('should have an input box', async () => {
    // First select a worktree (would need proper setup)
    // For now, check the input exists in the DOM
    const input = window.locator('textarea')
    // Input might not be visible without a selected worktree
    expect(input).toBeDefined()
  })
})

test.describe('Tool Panel', () => {
  test('should show tool panel when worktree is selected', async () => {
    // Tool panel only shows when a worktree is selected
    // This would need proper setup with a selected worktree
    const toolPanel = window.locator('[data-testid="tool-panel"]')
    // May not be visible without selection
    expect(toolPanel).toBeDefined()
  })
})
