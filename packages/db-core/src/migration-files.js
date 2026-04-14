const { readdirSync, readFileSync } = require('node:fs')
const { basename, resolve } = require('node:path')

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

function loadSqlMigrations(dirPath) {
  let files = []

  try {
    files = readdirSync(dirPath)
      .filter((file) => file.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }

  return files.map((file) => {
    const fullPath = resolve(dirPath, file)
    return {
      name: basename(file, '.sql'),
      file,
      fullPath,
      sql: readFileSync(fullPath, 'utf-8').trim(),
    }
  })
}

function loadMigrationFiles(options = {}) {
  const directories = [options.migrationsDir, ...(options.extraMigrationDirs ?? [])].filter(Boolean)
  const migrations = directories.flatMap((dirPath) => loadSqlMigrations(dirPath))

  return migrations.sort((left, right) => left.file.localeCompare(right.file))
}

module.exports = {
  loadMigrationFiles,
  loadSqlMigrations,
  splitStatements,
}
