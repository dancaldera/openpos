const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const bcrypt = require('bcryptjs')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createSyncManager } = require('./sync-manager.cjs')

const pkg = require('../package.json')

let mainWindow = null
let db = null
let syncManager = null

function isDev() {
  return !app.isPackaged
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420'
}

function getIndexHtmlPath() {
  return path.join(__dirname, '..', 'dist', 'index.html')
}

function getIconsDir() {
  const candidates = [
    path.join(__dirname, 'build', 'icons'),
    path.join(process.resourcesPath, 'electron', 'build', 'icons'),
    path.join(process.resourcesPath, 'app.asar', 'electron', 'build', 'icons'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'build', 'icons'),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

function getIconPath(kind = 'window') {
  const iconsDir = getIconsDir()

  if (process.platform === 'darwin') {
    return path.join(iconsDir, kind === 'dock' ? 'icon.icns' : 'icon.png')
  }

  return path.join(iconsDir, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function setAppIcon() {
  if (process.platform !== 'darwin' || typeof app.dock?.setIcon !== 'function') {
    return
  }

  const dockIconPath = getIconPath('dock')
  if (!fs.existsSync(dockIconPath)) {
    return
  }

  const dockIcon = nativeImage.createFromPath(dockIconPath)
  if (!dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon)
  }
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'postpos.db')
}

function getBootstrapDbPath() {
  const packageRoot = path.dirname(require.resolve('@openpos/data/package.json'))
  return path.join(packageRoot, 'assets', 'openpos-bootstrap.sqlite')
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function parseEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const values = {}

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) {
        continue
      }

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      values[key] = value
    }

    return values
  } catch {
    return {}
  }
}

function getDotEnvConfig() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '.env.local'),
    path.join(process.cwd(), '..', '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env.local'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '..', '.env.local'),
    path.join(__dirname, '..', '..', '..', '.env'),
  ]

  const mergedConfig = {}

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      Object.assign(mergedConfig, parseEnvFile(candidate))
    }
  }

  return mergedConfig
}

function getRuntimeConfig() {
  return parseJsonFile(getConfigPath())
}

function getDbConnectionConfig() {
  const config = getRuntimeConfig()
  const envConfig = getDotEnvConfig()
  const url = config.tursoDatabaseUrl || process.env.TURSO_DATABASE_URL || envConfig.TURSO_DATABASE_URL || undefined
  const authToken =
    config.tursoAuthToken || process.env.TURSO_AUTH_TOKEN || envConfig.TURSO_AUTH_TOKEN || undefined

  return {
    url,
    authToken,
    configured: Boolean(url && authToken),
  }
}

function tableHasColumn(database, tableName, columnName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName)
}

function ensureLegacyCompatibility(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      row_payload TEXT,
      local_updated_at DATETIME,
      base_remote_updated_at DATETIME,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'conflict', 'error')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(table_name, record_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_updated_at ON sync_outbox(updated_at);

    CREATE TABLE IF NOT EXISTS sync_state (
      table_name TEXT PRIMARY KEY,
      last_pulled_at DATETIME,
      last_sync_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  if (!tableHasColumn(database, 'users', 'updated_at')) {
    database.exec(`
      ALTER TABLE users ADD COLUMN updated_at DATETIME;
      UPDATE users SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);
    `)
  }

  if (!tableHasColumn(database, 'order_items', 'created_at')) {
    database.exec(`
      ALTER TABLE order_items ADD COLUMN created_at DATETIME;
      UPDATE order_items SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP);
    `)
  }

  if (!tableHasColumn(database, 'order_items', 'updated_at')) {
    database.exec(`
      ALTER TABLE order_items ADD COLUMN updated_at DATETIME;
      UPDATE order_items SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);
    `)
  }
}

function ensureDatabase() {
  if (db) {
    return db
  }

  fs.mkdirSync(app.getPath('userData'), { recursive: true })

  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) {
    const bootstrapDbPath = getBootstrapDbPath()
    if (!fs.existsSync(bootstrapDbPath)) {
      throw new Error(`Bootstrap database not found at ${bootstrapDbPath}`)
    }

    fs.copyFileSync(bootstrapDbPath, dbPath)
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  ensureLegacyCompatibility(db)

  return db
}

function runSelect(sql, params = []) {
  const database = ensureDatabase()
  return database.prepare(sql).all(...params)
}

function runExecute(sql, params = []) {
  const database = ensureDatabase()
  const capturedWrite = syncManager.captureWrite(database, sql, params)
  const result = database.prepare(sql).run(...params)
  syncManager.trackWrite(database, capturedWrite, result)

  return {
    lastInsertId: Number(result.lastInsertRowid ?? 0),
    rowsAffected: result.changes ?? 0,
  }
}

function runTransaction(statements) {
  const database = ensureDatabase()
  const trackedWrites = []
  const executeMany = database.transaction((items) => {
    for (const statement of items) {
      const capturedWrite = syncManager.captureWrite(database, statement.sql, statement.params || [])
      const result = database.prepare(statement.sql).run(...(statement.params || []))
      trackedWrites.push({
        capturedWrite,
        result,
      })
    }
  })

  executeMany(statements)

  for (const write of trackedWrites) {
    syncManager.trackWrite(database, write.capturedWrite, write.result)
  }
}

function resolvePrinterConfig() {
  const runtimeConfig = getRuntimeConfig()
  const command = process.env.OPENPOS_PRINTER_COMMAND || runtimeConfig.printerCommand || 'lp'
  const args = Array.isArray(runtimeConfig.printerArgs) ? runtimeConfig.printerArgs : []

  return { command, args }
}

function printThermalReceipt(receiptData) {
  return new Promise((resolve, reject) => {
    if (!receiptData || !String(receiptData).trim()) {
      reject(new Error('Receipt data cannot be empty'))
      return
    }

    const { command, args } = resolvePrinterConfig()
    const resolvedArgs = args.map((arg) => (arg === '{data}' ? receiptData : arg))
    const writesToStdin = !resolvedArgs.includes(receiptData)

    const child = spawn(command, resolvedArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start printer command "${command}": ${error.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || `Printer command "${command}" completed successfully`)
        return
      }

      reject(new Error(stderr.trim() || `Printer command "${command}" failed with exit code ${code ?? 'unknown'}`))
    })

    if (writesToStdin) {
      child.stdin.write(receiptData)
    }

    child.stdin.end()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev()) {
    mainWindow.loadURL(getRendererUrl())
  } else {
    mainWindow.loadFile(getIndexHtmlPath())
  }
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:info', () => ({
    isDesktop: true,
    isElectron: true,
    version: pkg.version,
  }))

  ipcMain.handle('desktop:greet', (_event, name) => `Hello, ${name}!!`)
  ipcMain.handle('desktop:hash-password', (_event, password) => bcrypt.hash(password, 12))
  ipcMain.handle('desktop:verify-password', (_event, password, hash) => bcrypt.compare(password, hash))
  ipcMain.handle('desktop:get-runtime-config', () => getRuntimeConfig())
  ipcMain.handle('desktop:db-query', (_event, sql, params) => runSelect(sql, params))
  ipcMain.handle('desktop:db-execute', (_event, sql, params) => runExecute(sql, params))
  ipcMain.handle('desktop:db-transaction', (_event, statements) => runTransaction(statements))
  ipcMain.handle('desktop:print-thermal-receipt', (_event, receiptData) => printThermalReceipt(receiptData))
  ipcMain.handle('desktop:sync-status', () => syncManager.getStatusSnapshot())
  ipcMain.handle('desktop:sync-trigger', () => syncManager.triggerSync())
  ipcMain.handle('desktop:sync-conflicts', () => syncManager.getConflictSummary())
}

app.whenReady().then(() => {
  setAppIcon()
  ensureDatabase()
  syncManager = createSyncManager({
    getDatabase: ensureDatabase,
    getRemoteConfig: getDbConnectionConfig,
  })
  registerIpcHandlers()
  createWindow()
  syncManager.start()

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

app.on('before-quit', () => {
  if (syncManager) {
    syncManager.stop()
  }

  if (db) {
    db.close()
    db = null
  }
})
