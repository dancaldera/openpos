// Shared electron mock for electron/*.cjs tests (see vitest.config alias).
// Each test file gets a fresh module instance; configure per test.
import { vi } from 'vitest'

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
}

export const ipcRenderer = {
  invoke: vi.fn(async () => undefined),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
}

export const app = {
  commandLine: { appendSwitch: vi.fn(), hasSwitch: vi.fn(() => false) },
  getAppPath: vi.fn(() => '/tmp/openpos-test'),
  getName: vi.fn(() => 'OpenPOS'),
  getPath: vi.fn(() => '/tmp/openpos-test-user-data'),
  getVersion: vi.fn(() => '0.0.0-test'),
  isPackaged: false,
  on: vi.fn(),
  once: vi.fn(),
  quit: vi.fn(),
  relaunch: vi.fn(),
  removeAllListeners: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
  setAppLogsPath: vi.fn(),
  whenReady: vi.fn(async () => {}),
}

export const BrowserWindow = vi.fn(function MockBrowserWindow() {
  return {
    close: vi.fn(),
    destroy: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    loadFile: vi.fn(async () => {}),
    loadURL: vi.fn(async () => {}),
    maximize: vi.fn(),
    minimize: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    restore: vi.fn(),
    setBounds: vi.fn(),
    setFullscreen: vi.fn(),
    show: vi.fn(),
    webContents: {
      executeJavaScript: vi.fn(async () => undefined),
      getURL: vi.fn(() => ''),
      isDestroyed: vi.fn(() => false),
      on: vi.fn(),
      once: vi.fn(),
      openDevTools: vi.fn(),
      reload: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
  }
})

export const Menu = {
  buildFromTemplate: vi.fn((template) => ({ template })),
  setApplicationMenu: vi.fn(),
}

export const dialog = {
  showErrorBox: vi.fn(),
  showMessageBox: vi.fn(async () => ({ response: 0 })),
  showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: '' })),
}

export const shell = {
  openExternal: vi.fn(async () => {}),
  openPath: vi.fn(async () => ''),
}

export const screen = {
  getPrimaryDisplay: vi.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
  getAllDisplays: vi.fn(() => []),
}

export const nativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system',
  on: vi.fn(),
}

export const nativeImage = {
  createFromPath: vi.fn(() => ({})),
}

export default {
  app,
  BrowserWindow,
  Menu,
  contextBridge,
  dialog,
  ipcMain,
  ipcRenderer,
  nativeImage,
  nativeTheme,
  screen,
  shell,
}
