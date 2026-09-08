const { applyLocalMigrations, replicatedTables } = require('@openpos/data')

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
  applyLocalMigrations(database)
  database.prepare('INSERT OR IGNORE INTO sync_metadata (id, version) VALUES (1, 0)').run()
  database.prepare(`DELETE FROM sync_outbox WHERE table_name IN ('orders', 'order_items')`).run()

  ensureUpdatedAtColumn(database, 'users')
  ensureCreatedAtColumn(database, 'order_items')
  ensureUpdatedAtColumn(database, 'order_items')
  ensureUpdatedAtIndexes(database)
}

module.exports = {
  ensureLocalSyncSchema,
}
