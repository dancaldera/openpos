import { createClient } from '@libsql/client'
const { applyRemoteMigrations } = require('../src/migration-runner.cjs')
const { loadEnv } = require('../src/internal/env')
const { repoRoot } = require('../src/project')

async function main() {
  const env = loadEnv({ repoRoot })
  const url = env.TURSO_DATABASE_URL
  const authToken = env.TURSO_AUTH_TOKEN
  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set in .env.local')
  }

  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is not set in .env.local')
  }

  const client = createClient({ url, authToken })
  try {
    const result = await applyRemoteMigrations(client)
    console.log('OpenPOS remote Drizzle migrations')
    console.log(`Found ${result.migrations.length} migration files`)
    console.log(`Applied ${result.appliedCount}, skipped ${result.skippedCount}`)
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
