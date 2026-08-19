import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
const { applyLocalMigrations } = require('../src/migration-runner.cjs')
const { bootstrapDatabasePath } = require('../src/project')

async function main() {
  mkdirSync(dirname(bootstrapDatabasePath), { recursive: true })
  rmSync(bootstrapDatabasePath, { force: true })

  const client = new DatabaseSync(bootstrapDatabasePath)
  client.exec('PRAGMA foreign_keys = ON')

  try {
    const result = applyLocalMigrations(client)
    console.log(`Bootstrap database written to ${bootstrapDatabasePath}`)
    console.log(`Applied ${result.appliedCount}, skipped ${result.skippedCount}`)
  } finally {
    client.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
