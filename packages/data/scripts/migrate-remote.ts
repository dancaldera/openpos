#!/usr/bin/env bun

import { createClient } from '@libsql/client'
const { runRemoteMigrations } = require('@dancaldera/libsql-bridge')
const { loadEnv } = require('../src/internal/env')
const { devMigrationsDir, migrationsDir, repoRoot } = require('../src/project')

async function main() {
  const env = loadEnv({ repoRoot })
  const url = env.TURSO_DATABASE_URL
  const authToken = env.TURSO_AUTH_TOKEN
  const includeDevSeeds = process.argv.includes('--include-dev-seeds')

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set in .env.local')
  }

  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is not set in .env.local')
  }

  const client = createClient({ url, authToken })
  const migrationsTable = '__drizzle_migrations'

  try {
    const schemaResult = await runRemoteMigrations(client, migrationsDir, migrationsTable)
    let totalApplied = schemaResult.appliedCount
    let totalSkipped = schemaResult.skippedCount
    let totalFiles = schemaResult.migrations.length

    if (includeDevSeeds) {
      const devResult = await runRemoteMigrations(client, devMigrationsDir, migrationsTable)
      totalApplied += devResult.appliedCount
      totalSkipped += devResult.skippedCount
      totalFiles += devResult.migrations.length
    }

    console.log(
      `OpenPOS remote migrations (${includeDevSeeds ? 'schema + required + dev seeds' : 'schema + required seeds'})`,
    )
    console.log(`Found ${totalFiles} migration files`)
    console.log(`Applied ${totalApplied}, skipped ${totalSkipped}`)
  } finally {
    if (typeof client.close === 'function') {
      client.close()
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
