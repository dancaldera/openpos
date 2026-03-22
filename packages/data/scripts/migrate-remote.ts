#!/usr/bin/env bun

import { loadEnv, loadRemoteMigrations, splitStatements } from '../src/migrations'

async function main() {
  const env = loadEnv()
  const url = env.TURSO_DATABASE_URL
  const authToken = env.TURSO_AUTH_TOKEN
  const includeDevSeeds = process.argv.includes('--include-dev-seeds')

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set in .env.local')
  }

  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is not set in .env.local')
  }

  const { connect } = await import('@tursodatabase/serverless')
  const client = connect({ url, authToken })

  await client.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = await client.execute('SELECT version FROM _migrations ORDER BY version')
  const appliedVersions = new Set<number>((applied.rows as Array<{ version: number }>).map((row) => row.version))
  const migrations = loadRemoteMigrations({ includeDevSeeds })

  console.log(`OpenPOS remote migrations (${includeDevSeeds ? 'schema + required + dev seeds' : 'schema + required seeds'})`)
  console.log(`Found ${migrations.length} migration files`)

  let appliedCount = 0
  let skippedCount = 0

  for (const migration of migrations) {
    const label = `V${String(migration.version).padStart(3, '0')} ${migration.description}`

    if (appliedVersions.has(migration.version)) {
      skippedCount += 1
      console.log(`skip ${label}`)
      continue
    }

    console.log(`apply ${label}`)

    for (const statement of splitStatements(migration.sql)) {
      await client.execute(statement)
    }

    await client.execute('INSERT INTO _migrations (version, description) VALUES (?, ?)', [
      migration.version,
      migration.description,
    ])

    appliedCount += 1
  }

  console.log(`Applied ${appliedCount}, skipped ${skippedCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
