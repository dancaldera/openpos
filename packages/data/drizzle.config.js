const { defineConfig } = require('drizzle-kit')
const { defineProjectConfig, loadEnv } = require('@openpos/db-core')
const { migrationsDir, repoRoot, schemaPath } = require('./src/project')

const env = loadEnv({ repoRoot })
const config = defineProjectConfig({
  schema: schemaPath,
  out: migrationsDir,
  dialect: 'turso',
})

if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
  config.dbCredentials = {
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  }
}

module.exports = defineConfig(config)
