#!/usr/bin/env bun

import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { Database } from 'bun:sqlite'
const { runLocalMigrations } = require('@dancaldera/libsql-bridge')
const { bootstrapDatabasePath, migrationsDir } = require('../src/project')

async function main() {
  mkdirSync(dirname(bootstrapDatabasePath), { recursive: true })
  rmSync(bootstrapDatabasePath, { force: true })

  const client = new Database(bootstrapDatabasePath, { create: true })
  client.exec('PRAGMA foreign_keys = ON')

  try {
    const result = runLocalMigrations(client, migrationsDir, '__drizzle_migrations')
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
