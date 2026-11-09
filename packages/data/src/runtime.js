/**
 * Runtime-portable store helpers (Node, Electron, Cloudflare Workers).
 *
 * Only depends on the embedded migration list and WebCrypto, so it can be
 * bundled into Workers without filesystem or native modules.
 */
const migrations = require('./migrations.generated.js')
const {
  DEMO_USER_EMAILS,
  ensureStoreOwner,
  generateConnectionKey,
  normalizeConnectionSecret,
  parseConnectionKey,
  readConnectionMeta,
  writeConnectionMeta,
} = require('./connection.cjs')

const migrationsTable = '__drizzle_migrations'
// Databases created before the migrations table existed already contain these.
const legacyMigrationNames = [
  '0000_openpos_schema',
  '0001_required_seeds',
  '0002_password_recovery_codes',
  '0003_password_reset_settings',
  '0004_password_reset_tokens',
]

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

function firstColumn(row) {
  if (Array.isArray(row)) return row[0]
  if (row && typeof row === 'object') {
    if ('name' in row) return row.name
    return row[0]
  }
  return row
}

async function tableExists(client, tableName) {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [tableName],
  })
  return result.rows.length > 0
}

/**
 * Apply pending store migrations to a libsql-compatible client. Compatible
 * with the history written by the previous file-based runner.
 */
async function applyStoreMigrations(client) {
  const hasHistory = await tableExists(client, migrationsTable)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "${migrationsTable}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  if (!hasHistory && (await tableExists(client, 'users'))) {
    for (const name of legacyMigrationNames) {
      await client.execute({ sql: `INSERT OR IGNORE INTO "${migrationsTable}" (name) VALUES (?)`, args: [name] })
    }
  }

  const result = await client.execute(`SELECT name FROM "${migrationsTable}" ORDER BY id ASC`)
  const applied = new Set(result.rows.map((row) => String(firstColumn(row))))
  let appliedCount = 0
  let skippedCount = 0

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      skippedCount += 1
      continue
    }
    for (const statement of splitStatements(migration.sql)) {
      await client.execute(statement)
    }
    await client.execute({ sql: `INSERT INTO "${migrationsTable}" (name) VALUES (?)`, args: [migration.name] })
    appliedCount += 1
  }

  return {
    appliedCount,
    skippedCount,
    migrations: migrations.map(({ name }) => ({ name, file: `${name}.sql` })),
  }
}

/** Name of the newest migration bundled with this build. */
function latestMigrationName() {
  return migrations.length ? migrations[migrations.length - 1].name : null
}

module.exports = {
  DEMO_USER_EMAILS,
  applyStoreMigrations,
  ensureStoreOwner,
  generateConnectionKey,
  latestMigrationName,
  migrations,
  migrationsTable,
  normalizeConnectionSecret,
  parseConnectionKey,
  readConnectionMeta,
  writeConnectionMeta,
}
