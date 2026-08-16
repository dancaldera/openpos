const { readdirSync, readFileSync } = require('node:fs')
const { basename, resolve } = require('node:path')

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function loadMigrationFiles(migrationsDir) {
  let files = []
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }

  return files.map((file) => {
    const fullPath = resolve(migrationsDir, file)
    return {
      name: basename(file, '.sql'),
      file,
      fullPath,
      sql: readFileSync(fullPath, 'utf-8').trim(),
    }
  })
}

function runLocalMigrations(client, migrationsDir, tableName = '__drizzle_migrations') {
  const migrations = loadMigrationFiles(migrationsDir)

  client.exec(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const appliedRows = client.prepare(`SELECT name FROM ${quoteIdentifier(tableName)} ORDER BY id ASC`).all()
  const applied = new Set(appliedRows.map((row) => String(row.name)))

  let appliedCount = 0
  let skippedCount = 0

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      skippedCount += 1
      continue
    }

    for (const statement of splitStatements(migration.sql)) {
      client.exec(statement)
    }

    client.prepare(`INSERT INTO ${quoteIdentifier(tableName)} (name) VALUES (?)`).run(migration.name)
    appliedCount += 1
  }

  return {
    appliedCount,
    skippedCount,
    migrations: migrations.map(({ name, file }) => ({ name, file })),
  }
}

async function runRemoteMigrations(client, migrationsDir, tableName = '__drizzle_migrations') {
  const migrations = loadMigrationFiles(migrationsDir)

  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  )
  const result = await client.execute(`SELECT name FROM ${quoteIdentifier(tableName)} ORDER BY id ASC`)
  const applied = new Set(result.rows.map((row) => String(Array.isArray(row) ? row[0] : row.name)))

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

    await client.execute(`INSERT INTO ${quoteIdentifier(tableName)} (name) VALUES (?)`, [migration.name])
    appliedCount += 1
  }

  return {
    appliedCount,
    skippedCount,
    migrations: migrations.map(({ name, file }) => ({ name, file })),
  }
}

module.exports = {
  loadMigrationFiles,
  runLocalMigrations,
  runRemoteMigrations,
}
