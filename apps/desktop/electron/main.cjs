const { app, BrowserWindow, ipcMain } = require('electron')
const bcrypt = require('bcryptjs')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const pkg = require('../package.json')

let mainWindow = null
let db = null

function isDev() {
  return !app.isPackaged
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420'
}

function getIndexHtmlPath() {
  return path.join(__dirname, '..', 'dist', 'index.html')
}

function getIconPath() {
  const iconsDir = path.join(__dirname, 'build', 'icons')
  return path.join(iconsDir, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'postpos.db')
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function getRuntimeConfig() {
  return parseJsonFile(getConfigPath())
}

function getDbConnectionConfig() {
  const config = getRuntimeConfig()
  const url = config.tursoDatabaseUrl || process.env.TURSO_DATABASE_URL || undefined
  const authToken = config.tursoAuthToken || process.env.TURSO_AUTH_TOKEN || undefined

  return {
    url,
    authToken,
    configured: Boolean(url && authToken),
  }
}

function ensureDatabase() {
  if (db) {
    return db
  }

  fs.mkdirSync(app.getPath('userData'), { recursive: true })

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS __desktop_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `)

  applyMigrations(db, path.join(__dirname, 'migrations', 'schema'), 'schema')
  applyMigrations(db, path.join(__dirname, 'migrations', 'seeds'), 'seeds')

  return db
}

function applyMigrations(database, dirPath, kind) {
  if (!fs.existsSync(dirPath)) {
    return
  }

  const applied = new Set(
    database.prepare('SELECT filename FROM __desktop_migrations').all().map((row) => row.filename),
  )

  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  for (const file of files) {
    const key = `${kind}/${file}`
    if (applied.has(key)) {
      continue
    }

    const sql = fs.readFileSync(path.join(dirPath, file), 'utf8')
    database.exec(sql)
    database
      .prepare('INSERT INTO __desktop_migrations (filename, applied_at) VALUES (?, ?)')
      .run(key, new Date().toISOString())
  }
}

function runSelect(sql, params = []) {
  const database = ensureDatabase()
  return database.prepare(sql).all(...params)
}

function runExecute(sql, params = []) {
  const database = ensureDatabase()
  const result = database.prepare(sql).run(...params)

  return {
    lastInsertId: Number(result.lastInsertRowid ?? 0),
    rowsAffected: result.changes ?? 0,
  }
}

function runTransaction(statements) {
  const database = ensureDatabase()
  const executeMany = database.transaction((items) => {
    for (const statement of items) {
      database.prepare(statement.sql).run(...(statement.params || []))
    }
  })

  executeMany(statements)
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
  ipcMain.handle('desktop:get-db-connection-config', () => getDbConnectionConfig())
  ipcMain.handle('desktop:get-runtime-config', () => getRuntimeConfig())
  ipcMain.handle('desktop:db-query', (_event, sql, params) => runSelect(sql, params))
  ipcMain.handle('desktop:db-execute', (_event, sql, params) => runExecute(sql, params))
  ipcMain.handle('desktop:db-transaction', (_event, statements) => runTransaction(statements))
  ipcMain.handle('desktop:print-thermal-receipt', (_event, receiptData) => printThermalReceipt(receiptData))
}

app.whenReady().then(() => {
  ensureDatabase()
  registerIpcHandlers()
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

app.on('before-quit', () => {
  if (db) {
    db.close()
    db = null
  }
})
