#!/usr/bin/env bun

import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
const { runLocalMigrations } = require('@openpos/db-core')
const { bootstrapDatabasePath, migrationsDir } = require('../src/project')

async function main() {
  mkdirSync(dirname(bootstrapDatabasePath), { recursive: true })
  rmSync(bootstrapDatabasePath, { force: true })

  const result = runLocalMigrations({
    fileName: bootstrapDatabasePath,
    migrationsDir,
  })

  console.log(`Bootstrap database written to ${bootstrapDatabasePath}`)
  console.log(`Applied ${result.appliedCount}, skipped ${result.skippedCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
