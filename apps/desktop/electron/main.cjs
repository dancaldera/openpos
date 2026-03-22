const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const bcrypt = require('bcryptjs')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createPublicConnectionConfig, resolveDesktopConnectionConfig } = require('./config-resolver.cjs')
const { createSyncManager } = require('./sync-manager.cjs')

const pkg = require('../package.json')

let mainWindow = null
let db = null
let syncManager = null
let initialSyncPromise = null
let initialSyncError = null
let orderSyncTimer = null
let orderSyncPromise = null

const ORDER_SYNC_INTERVAL_MS = 15_000
const ORDER_COLUMNS = [
  'id',
  'subtotal',
  'tax',
  'total',
  'status',
  'payment_method',
  'notes',
  'created_at',
  'updated_at',
  'completed_at',
  'user_id',
  'customer_id',
]
const ORDER_ITEM_COLUMNS = [
  'id',
  'order_id',
  'product_id',
  'product_name',
  'quantity',
  'unit_price',
  'total_price',
  'variant_id',
  'variant_attributes',
  'created_at',
  'updated_at',
]

function logStartup(message, details) {
  if (details === undefined) {
    console.log(`[startup] ${message}`)
    return
  }

  console.log(`[startup] ${message}`, details)
}

function logOrderSync(message, details) {
  if (details === undefined) {
    console.log(`[order-sync] ${message}`)
    return
  }

  console.log(`[order-sync] ${message}`, details)
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function quoteColumns(columns) {
  return columns.map((column) => quoteIdentifier(column)).join(', ')
}

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

function resolveConnectionConfig() {
  return resolveDesktopConnectionConfig({
    runtimeConfig: getRuntimeConfig(),
    processEnv: process.env,
    envConfig: getDotEnvConfig(),
    defaultApiUrl: isDev() ? 'http://localhost:3001' : undefined,
  })
}

function getDbConnectionConfig() {
  return resolveConnectionConfig().remote
}

function getApiConnectionConfig() {
  return resolveConnectionConfig().api
}

async function probeApiConnection() {
  const apiConfig = getApiConnectionConfig()
  const checkedAt = new Date().toISOString()

  if (!apiConfig.configured || !apiConfig.url) {
    return {
      ...createPublicConnectionConfig({ api: apiConfig, remote: getDbConnectionConfig() }),
      apiReachable: false,
      apiLastCheckedAt: checkedAt,
      apiLastError: null,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3_000)

  try {
    const healthUrl = new URL('/api/health', apiConfig.url).toString()
    const response = await fetch(healthUrl, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`API health check failed with ${response.status}`)
    }

    return {
      ...createPublicConnectionConfig({ api: apiConfig, remote: getDbConnectionConfig() }),
      apiReachable: true,
      apiLastCheckedAt: checkedAt,
      apiLastError: null,
    }
  } catch (error) {
    return {
      ...createPublicConnectionConfig({ api: apiConfig, remote: getDbConnectionConfig() }),
      apiReachable: false,
      apiLastCheckedAt: checkedAt,
      apiLastError: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function getConnectivitySnapshot(options = {}) {
  if (options.refresh) {
    await syncManager.triggerSync({ foreground: true })
  }

  const apiSnapshot = await probeApiConnection()
  const syncSnapshot = syncManager.getStatusSnapshot()

  return {
    ...syncSnapshot,
    ...apiSnapshot,
  }
}

function getActiveUserCount(database = ensureDatabase()) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`).get()
  return Number(row?.count ?? 0)
}

function getFirstRunStatus(database = ensureDatabase()) {
  const activeUserCount = getActiveUserCount(database)
  const remoteConfig = getDbConnectionConfig()
  const syncSnapshot = syncManager ? syncManager.getStatusSnapshot(database) : null
  let nextStatus = null

  if (activeUserCount > 0) {
    initialSyncError = null
    nextStatus = {
      status: 'readyForSignIn',
      remoteConfigured: Boolean(remoteConfig.configured),
      activeUserCount,
      lastError: null,
      lastCheckedAt: syncSnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: syncSnapshot?.lastSyncedAt ?? null,
    }
    logStartup('first-run status resolved', nextStatus)
    return nextStatus
  }

  if (!remoteConfig.configured) {
    nextStatus = {
      status: 'needsRemoteConfig',
      remoteConfigured: false,
      activeUserCount,
      lastError: null,
      lastCheckedAt: syncSnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: syncSnapshot?.lastSyncedAt ?? null,
    }
    logStartup('first-run status resolved', nextStatus)
    return nextStatus
  }

  if (initialSyncPromise || syncSnapshot?.status === 'syncing') {
    nextStatus = {
      status: 'syncingInitialData',
      remoteConfigured: true,
      activeUserCount,
      lastError: null,
      lastCheckedAt: syncSnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: syncSnapshot?.lastSyncedAt ?? null,
    }
    logStartup('first-run status resolved', nextStatus)
    return nextStatus
  }

  if (initialSyncError) {
    nextStatus = {
      status: 'initialSyncFailed',
      remoteConfigured: true,
      activeUserCount,
      lastError: initialSyncError,
      lastCheckedAt: syncSnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: syncSnapshot?.lastSyncedAt ?? null,
    }
    logStartup('first-run status resolved', nextStatus)
    return nextStatus
  }

  nextStatus = {
    status: 'syncingInitialData',
    remoteConfigured: true,
    activeUserCount,
    lastError: null,
    lastCheckedAt: syncSnapshot?.lastCheckedAt ?? null,
    lastSyncedAt: syncSnapshot?.lastSyncedAt ?? null,
  }

  logStartup('first-run status resolved', nextStatus)
  return nextStatus
}

async function initializeFirstRun() {
  const status = getFirstRunStatus()
  logStartup('initialize first run requested', {
    status: status.status,
    activeUserCount: status.activeUserCount,
    remoteConfigured: status.remoteConfigured,
  })

  if (status.status === 'readyForSignIn' || status.status === 'needsRemoteConfig') {
    return status
  }

  if (initialSyncPromise) {
    logStartup('initial sync already in progress')
    return initialSyncPromise
  }

  initialSyncError = null

  initialSyncPromise = (async () => {
    let resolvedStatus = null

    try {
      logStartup('starting initial sync', {
        dbPath: getDbPath(),
        remoteConfigured: getDbConnectionConfig().configured,
        activeUserCountBefore: getActiveUserCount(),
      })
      const syncSnapshot = await syncManager.triggerSync({ foreground: true })
      logStartup('initial sync finished', syncSnapshot)

      if (getActiveUserCount() > 0) {
        initialSyncError = null
        logStartup('initial sync populated local users', { activeUserCount: getActiveUserCount() })
        resolvedStatus = getFirstRunStatus()
      } else {
        initialSyncError = syncSnapshot?.lastError || 'Initial sync completed, but no active users were mirrored from Turso.'
        logStartup('initial sync completed without local users', {
          activeUserCount: getActiveUserCount(),
          lastError: initialSyncError,
        })
      }
    } catch (error) {
      initialSyncError = error instanceof Error ? error.message : String(error)
      logStartup('initial sync threw error', {
        error: initialSyncError,
      })
    } finally {
      logStartup('initial sync promise cleared')
      initialSyncPromise = null
    }

    return resolvedStatus ?? getFirstRunStatus()
  })()

  return initialSyncPromise
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

    CREATE TABLE IF NOT EXISTS order_sync_queue (
      order_id TEXT PRIMARY KEY,
      operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.prepare(`DELETE FROM sync_outbox WHERE table_name IN ('orders', 'order_items')`).run()

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

async function getRemoteDbClient() {
  const config = getDbConnectionConfig()

  if (!config.configured || !config.url || !config.authToken) {
    return null
  }

  const { connect } = await import('@tursodatabase/serverless')
  return connect({
    url: config.url,
    authToken: config.authToken,
  })
}

function upsertOrderSyncQueue(database, orderId, operation, lastError = null) {
  const now = new Date().toISOString()

  database
    .prepare(
      `INSERT INTO order_sync_queue (order_id, operation, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         operation = excluded.operation,
         attempts = order_sync_queue.attempts + 1,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .run(String(orderId), operation, lastError, now, now)
}

function ensureOrderSyncQueue(database, orderId, operation) {
  const now = new Date().toISOString()

  database
    .prepare(
      `INSERT INTO order_sync_queue (order_id, operation, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, 0, NULL, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         operation = excluded.operation,
         updated_at = excluded.updated_at`,
    )
    .run(String(orderId), operation, now, now)
}

function clearOrderSyncQueue(database, orderId) {
  database.prepare('DELETE FROM order_sync_queue WHERE order_id = ?').run(String(orderId))
}

function getLocalOrderAggregate(database, orderId) {
  const order = database
    .prepare(`SELECT ${quoteColumns(ORDER_COLUMNS)} FROM orders WHERE id = ? LIMIT 1`)
    .get(Number(orderId))

  const items = database
    .prepare(
      `SELECT ${quoteColumns(ORDER_ITEM_COLUMNS)}
         FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC`,
    )
    .all(Number(orderId))

  return { order, items }
}

async function applyRemoteOrderAggregate(client, database, orderId, operation) {
  const numericOrderId = Number(orderId)

  if (operation === 'DELETE') {
    await client.execute('DELETE FROM order_items WHERE order_id = ?', [numericOrderId])
    await client.execute('DELETE FROM orders WHERE id = ?', [numericOrderId])
    return
  }

  const { order, items } = getLocalOrderAggregate(database, orderId)

  if (!order) {
    throw new Error(`Local order ${orderId} not found for remote aggregate sync`)
  }

  const orderAssignments = ORDER_COLUMNS.filter((column) => column !== 'id')
    .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
    .join(', ')
  const orderPlaceholders = ORDER_COLUMNS.map(() => '?').join(', ')

  await client.execute(
    `INSERT INTO orders (${quoteColumns(ORDER_COLUMNS)})
     VALUES (${orderPlaceholders})
     ON CONFLICT(${quoteIdentifier('id')}) DO UPDATE SET ${orderAssignments}`,
    ORDER_COLUMNS.map((column) => order[column] ?? null),
  )

  await client.execute('DELETE FROM order_items WHERE order_id = ?', [numericOrderId])

  const itemPlaceholders = ORDER_ITEM_COLUMNS.map(() => '?').join(', ')
  for (const item of items) {
    await client.execute(
      `INSERT INTO order_items (${quoteColumns(ORDER_ITEM_COLUMNS)})
       VALUES (${itemPlaceholders})`,
      ORDER_ITEM_COLUMNS.map((column) => item[column] ?? null),
    )
  }
}

async function syncOrderAggregate(orderId, operation, options = {}) {
  const queueOnError = options.queueOnError !== false
  const database = ensureDatabase()

  if (queueOnError) {
    ensureOrderSyncQueue(database, orderId, operation)
    logOrderSync('aggregate protected locally pending remote push', {
      orderId: String(orderId),
      operation,
    })
  }

  const client = await getRemoteDbClient()

  if (!client) {
    const error = new Error('Remote database is not configured')
    if (queueOnError) {
      upsertOrderSyncQueue(database, orderId, operation, error.message)
    }
    throw error
  }

  try {
    await client.execute('SELECT 1')
    await applyRemoteOrderAggregate(client, database, orderId, operation)
    clearOrderSyncQueue(database, orderId)
    logOrderSync('aggregate synced', {
      orderId: String(orderId),
      operation,
    })
    return { queued: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (queueOnError) {
      upsertOrderSyncQueue(database, orderId, operation, message)
      logOrderSync('aggregate sync queued for retry', {
        orderId: String(orderId),
        operation,
        error: message,
      })
      return { queued: true }
    }

    throw error
  }
}

async function flushOrderSyncQueue() {
  if (orderSyncPromise) {
    return orderSyncPromise
  }

  orderSyncPromise = (async () => {
    const database = ensureDatabase()
    const queuedOrders = database
      .prepare('SELECT order_id, operation FROM order_sync_queue ORDER BY updated_at ASC')
      .all()

    for (const row of queuedOrders) {
      try {
        await syncOrderAggregate(row.order_id, row.operation, { queueOnError: false })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        database
          .prepare(
            `UPDATE order_sync_queue
                SET attempts = attempts + 1,
                    last_error = ?,
                    updated_at = ?
              WHERE order_id = ?`,
          )
          .run(message, new Date().toISOString(), String(row.order_id))
        logOrderSync('aggregate retry failed', {
          orderId: String(row.order_id),
          operation: row.operation,
          error: message,
        })
      }
    }
  })().finally(() => {
    orderSyncPromise = null
  })

  return orderSyncPromise
}

function startOrderSyncQueue() {
  if (orderSyncTimer) {
    return
  }

  void flushOrderSyncQueue()
  orderSyncTimer = setInterval(() => {
    void flushOrderSyncQueue()
  }, ORDER_SYNC_INTERVAL_MS)
}

function stopOrderSyncQueue() {
  if (orderSyncTimer) {
    clearInterval(orderSyncTimer)
    orderSyncTimer = null
  }
}

function ensureDatabase() {
  if (db) {
    return db
  }

  fs.mkdirSync(app.getPath('userData'), { recursive: true })

  const dbPath = getDbPath()
  logStartup('ensuring local database', { dbPath })
  if (!fs.existsSync(dbPath)) {
    const bootstrapDbPath = getBootstrapDbPath()
    if (!fs.existsSync(bootstrapDbPath)) {
      throw new Error(`Bootstrap database not found at ${bootstrapDbPath}`)
    }

    logStartup('creating local database from bootstrap', { bootstrapDbPath, dbPath })
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
  ipcMain.handle('desktop:db-query', (_event, sql, params) => runSelect(sql, params))
  ipcMain.handle('desktop:db-execute', (_event, sql, params) => runExecute(sql, params))
  ipcMain.handle('desktop:db-transaction', (_event, statements) => runTransaction(statements))
  ipcMain.handle('desktop:print-thermal-receipt', (_event, receiptData) => printThermalReceipt(receiptData))
  ipcMain.handle('desktop:sync-status', () => syncManager.getStatusSnapshot())
  ipcMain.handle('desktop:sync-trigger', () => syncManager.triggerSync({ foreground: true }))
  ipcMain.handle('desktop:sync-conflicts', () => syncManager.getConflictSummary())
  ipcMain.handle('desktop:connectivity-status', () => getConnectivitySnapshot())
  ipcMain.handle('desktop:connectivity-refresh', () => getConnectivitySnapshot({ refresh: true }))
  ipcMain.handle('desktop:startup-status', () => getFirstRunStatus())
  ipcMain.handle('desktop:startup-initialize', () => initializeFirstRun())
  ipcMain.handle('desktop:startup-retry', () => initializeFirstRun())
  ipcMain.handle('desktop:orders-sync-aggregate', (_event, payload) =>
    syncOrderAggregate(payload.orderId, payload.operation),
  )
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
  startOrderSyncQueue()

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

  stopOrderSyncQueue()

  if (db) {
    db.close()
    db = null
  }
})
