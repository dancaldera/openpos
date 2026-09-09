import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
const { applyLocalMigrations, migrationsTable } = require('../src/migration-runner.cjs')
const { bootstrapDatabasePath } = require('../src/project')

const reproducibleMigrationTimestamp = '1970-01-01 00:00:00'

export async function runBuildBootstrap({ dbPath, applyMigrations, table }) {
  mkdirSync(dirname(dbPath), { recursive: true })
  rmSync(dbPath, { force: true })

  const client = new DatabaseSync(dbPath)
  client.exec('PRAGMA foreign_keys = ON')

  try {
    const result = applyMigrations(client)
    client.prepare(`UPDATE "${table}" SET "applied_at" = ?`).run(reproducibleMigrationTimestamp)
    console.log(`Bootstrap database written to ${dbPath}`)
    console.log(`Applied ${result.appliedCount}, skipped ${result.skippedCount}`)
    return result
  } finally {
    client.close()
  }
}

export function reportScriptFailure(error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

/* istanbul ignore if: production entrypoint (unit tests call runBuildBootstrap directly). */
if (require.main === module) {
  runBuildBootstrap({
    dbPath: bootstrapDatabasePath,
    applyMigrations: applyLocalMigrations,
    table: migrationsTable,
  }).catch(reportScriptFailure)
}
