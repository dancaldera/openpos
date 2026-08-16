const { defineConfig } = require('drizzle-kit')
const { defineDrizzleConfig } = require('./src/internal/project-paths')
const { loadEnv } = require('./src/internal/env')
const { migrationsDir, repoRoot, schemaPath } = require('./src/project')

const env = loadEnv({ repoRoot })
const config = defineDrizzleConfig({
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
