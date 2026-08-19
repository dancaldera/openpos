const { runLocalMigrations, runRemoteMigrations } = require('@dancaldera/libsql-bridge')
const { migrationsDir } = require('./project')

const migrationsTable = '__drizzle_migrations'
const legacyMigrationNames = [
  '0000_openpos_schema',
  '0001_required_seeds',
  '0002_password_recovery_codes',
  '0003_password_reset_settings',
  '0004_password_reset_tokens',
]

function localTableExists(client, tableName) {
  return Boolean(
    client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName)?.name,
  )
}

function seedLegacyLocalMigrationHistory(client) {
  client.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const insert = client.prepare(`INSERT OR IGNORE INTO ${migrationsTable} (name) VALUES (?)`)
  for (const name of legacyMigrationNames) {
    insert.run(name)
  }
}

async function remoteTableExists(client, tableName) {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  )
  return result.rows.length > 0
}

async function seedLegacyRemoteMigrationHistory(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const name of legacyMigrationNames) {
    await client.execute(`INSERT OR IGNORE INTO ${migrationsTable} (name) VALUES (?)`, [name])
  }
}

function applyLocalMigrations(client) {
  if (!localTableExists(client, migrationsTable) && localTableExists(client, 'users')) {
    seedLegacyLocalMigrationHistory(client)
  }

  return runLocalMigrations(client, migrationsDir, migrationsTable)
}

async function applyRemoteMigrations(client) {
  if (!(await remoteTableExists(client, migrationsTable)) && (await remoteTableExists(client, 'users'))) {
    await seedLegacyRemoteMigrationHistory(client)
  }

  return runRemoteMigrations(client, migrationsDir, migrationsTable)
}

module.exports = {
  applyLocalMigrations,
  applyRemoteMigrations,
  migrationsTable,
}
