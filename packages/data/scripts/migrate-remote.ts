#!/usr/bin/env bun

const { loadEnv, runTursoMigrations } = require('@openpos/db-core')
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

  const result = await runTursoMigrations({
    url,
    authToken,
    migrationsDir,
    extraMigrationDirs: includeDevSeeds ? [devMigrationsDir] : [],
  })

  console.log(`OpenPOS remote migrations (${includeDevSeeds ? 'schema + required + dev seeds' : 'schema + required seeds'})`)
  console.log(`Found ${result.migrations.length} migration files`)
  console.log(`Applied ${result.appliedCount}, skipped ${result.skippedCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
