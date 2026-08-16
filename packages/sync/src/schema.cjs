const { replicatedTables } = require('@openpos/data')

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function tableExists(database, tableName) {
  const row = database
    .prepare(
      `SELECT name
         FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
        LIMIT 1`,
    )
    .get(tableName)

  return Boolean(row?.name)
}

function tableHasColumn(database, tableName, columnName) {
  if (!tableExists(database, tableName)) {
    return false
  }

  return database.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().some((column) => column.name === columnName)
}

function ensureUpdatedAtColumn(database, tableName, fallbackExpression = 'CURRENT_TIMESTAMP') {
  if (!tableExists(database, tableName) || tableHasColumn(database, tableName, 'updated_at')) {
    return
  }

  database.exec(`
    ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN updated_at DATETIME;
    UPDATE ${quoteIdentifier(tableName)}
       SET updated_at = COALESCE(updated_at, created_at, ${fallbackExpression});
  `)
}

function ensureCreatedAtColumn(database, tableName, fallbackExpression = 'CURRENT_TIMESTAMP') {
  if (!tableExists(database, tableName) || tableHasColumn(database, tableName, 'created_at')) {
    return
  }

  database.exec(`
    ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN created_at DATETIME;
    UPDATE ${quoteIdentifier(tableName)}
       SET created_at = COALESCE(created_at, ${fallbackExpression});
  `)
}

function ensureUpdatedAtIndexes(database) {
  for (const config of replicatedTables) {
    if (!tableExists(database, config.tableName) || !tableHasColumn(database, config.tableName, config.watermarkColumn)) {
      continue
    }

    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_${config.tableName}_${config.watermarkColumn} ON ${quoteIdentifier(config.tableName)}(${quoteIdentifier(config.watermarkColumn)})`,
    )
  }
}

function ensureLocalSyncSchema(database) {
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

    CREATE TABLE IF NOT EXISTS sync_metadata (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO sync_metadata (id, version) VALUES (1, 0);
  `)

  database.prepare(`DELETE FROM sync_outbox WHERE table_name IN ('orders', 'order_items')`).run()

  ensureUpdatedAtColumn(database, 'users')
  ensureCreatedAtColumn(database, 'order_items')
  ensureUpdatedAtColumn(database, 'order_items')
  ensureUpdatedAtIndexes(database)
}

module.exports = {
  ensureLocalSyncSchema,
}
