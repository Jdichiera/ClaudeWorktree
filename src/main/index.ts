import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { URL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupGitHandlers } from './ipc/git-handlers'
import { setupAgentHandlers } from './ipc/agent-handlers'
import { agentManager } from './services/agent-manager'

let mainWindow: BrowserWindow | null = null

// Allowed protocols for external URLs
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Validate URL before opening externally
 * Only allows http and https protocols to prevent local file access and code execution
 */
function isAllowedExternalUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return ALLOWED_PROTOCOLS.has(url.protocol)
  } catch {
    // Invalid URL
    return false
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    // Clean up the window reference
    mainWindow = null
  })

  // Validate URLs before opening externally - only allow http/https
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isAllowedExternalUrl(details.url)) {
      shell.openExternal(details.url)
    } else {
      console.warn('Blocked attempt to open disallowed URL:', details.url)
    }
    return { action: 'deny' }
  })

  // Also handle navigation attempts
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation to the app itself in dev mode
    if (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) {
      return
    }
    // Block all other navigations
    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Setup IPC handlers
  setupGitHandlers()
  setupAgentHandlers(mainWindow)
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.claudeworktree')

  // Watch for shortcuts in dev mode
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up agent manager when app quits
app.on('will-quit', () => {
  // Update agent manager's window reference
  agentManager.setMainWindow(null as unknown as BrowserWindow)
})
