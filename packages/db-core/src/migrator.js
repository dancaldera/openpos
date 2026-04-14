const { dirname } = require('node:path')
const { mkdirSync } = require('node:fs')
const { createLocalSqliteDb, createTursoDb } = require('./clients')
const { loadMigrationFiles, splitStatements } = require('./migration-files')

const DEFAULT_MIGRATIONS_TABLE = '__drizzle_migrations'

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function ensureLocalMigrationsTable(database, tableName) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function ensureRemoteMigrationsTable(client, tableName) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function getAppliedLocalMigrations(database, tableName) {
  ensureLocalMigrationsTable(database, tableName)
  return new Set(
    database
      .prepare(`SELECT name FROM ${quoteIdentifier(tableName)} ORDER BY id ASC`)
      .all()
      .map((row) => String(row.name)),
  )
}

function openDefaultLocalMigrationClient(fileName, pragmas) {
  try {
    const { Database } = require('bun:sqlite')
    const client = new Database(fileName, { create: true })

    for (const pragma of pragmas ?? ['foreign_keys = ON']) {
      client.exec(`PRAGMA ${pragma}`)
    }

    return client
  } catch {
    return createLocalSqliteDb({
      fileName,
      pragmas,
    }).client
  }
}

async function getAppliedRemoteMigrations(client, tableName) {
  await ensureRemoteMigrationsTable(client, tableName)
  const result = await client.execute(`SELECT name FROM ${quoteIdentifier(tableName)} ORDER BY id ASC`)

  return new Set(
    result.rows.map((row) => {
      if (Array.isArray(row)) {
        return String(row[0])
      }

      return String(row.name)
    }),
  )
}

function runLocalMigrations(options) {
  const tableName = options.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE
  const migrations = loadMigrationFiles({
    migrationsDir: options.migrationsDir,
    extraMigrationDirs: options.extraMigrationDirs,
  })

  let ownConnection = false
  let client = options.client

  if (!client) {
    if (!options.fileName) {
      throw new Error('runLocalMigrations requires either a fileName or client')
    }

    mkdirSync(dirname(options.fileName), { recursive: true })
    client = openDefaultLocalMigrationClient(options.fileName, options.pragmas)
    ownConnection = true
  }

  try {
    const appliedMigrations = getAppliedLocalMigrations(client, tableName)
    let appliedCount = 0
    let skippedCount = 0

    for (const migration of migrations) {
      if (appliedMigrations.has(migration.name)) {
        skippedCount += 1
        continue
      }

      for (const statement of splitStatements(migration.sql)) {
        client.exec(statement)
      }

      client
        .prepare(`INSERT INTO ${quoteIdentifier(tableName)} (name) VALUES (?)`)
        .run(migration.name)
      appliedCount += 1
    }

    return {
      appliedCount,
      skippedCount,
      migrations,
    }
  } finally {
    if (ownConnection) {
      client.close()
    }
  }
}

async function runTursoMigrations(options) {
  const tableName = options.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE
  const migrations = loadMigrationFiles({
    migrationsDir: options.migrationsDir,
    extraMigrationDirs: options.extraMigrationDirs,
  })

  let ownConnection = false
  let client = options.client

  if (!client) {
    if (!options.url) {
      throw new Error('runTursoMigrations requires either a client or url/authToken')
    }

    client = createTursoDb({
      url: options.url,
      authToken: options.authToken,
      schema: options.schema,
    }).client
    ownConnection = true
  }

  try {
    const appliedMigrations = await getAppliedRemoteMigrations(client, tableName)
    let appliedCount = 0
    let skippedCount = 0

    for (const migration of migrations) {
      if (appliedMigrations.has(migration.name)) {
        skippedCount += 1
        continue
      }

      for (const statement of splitStatements(migration.sql)) {
        await client.execute(statement)
      }

      await client.execute(`INSERT INTO ${quoteIdentifier(tableName)} (name) VALUES (?)`, [migration.name])
      appliedCount += 1
    }

    return {
      appliedCount,
      skippedCount,
      migrations,
    }
  } finally {
    if (ownConnection && typeof client.close === 'function') {
      await client.close()
    }
  }
}

module.exports = {
  DEFAULT_MIGRATIONS_TABLE,
  runLocalMigrations,
  runTursoMigrations,
}
