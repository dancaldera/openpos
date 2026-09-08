const schema = require('./schema')
const { replicatedTables, replicatedTablesByName } = require('./replicated-tables')
const { applyLocalMigrations, applyRemoteMigrations, migrationsTable } = require('./migration-runner.cjs')
const { migrationsDir } = require('./project')
const {
  DEMO_USER_EMAILS,
  connectionFileStem,
  ensureStoreOwner,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  hostedDatabaseName,
  normalizeConnectionSecret,
  parseConnectionKey,
  parseConnectionSeed,
  readConnectionMeta,
  seedFreshStore,
  writeConnectionMeta,
} = require('./connection.cjs')

// Named shorthand exports (not spreads of require() results) so Node's ESM
// interop can statically detect them when imported from ES modules.
module.exports = {
  schema,
  replicatedTables,
  replicatedTablesByName,
  applyLocalMigrations,
  applyRemoteMigrations,
  migrationsDir,
  migrationsTable,
  DEMO_USER_EMAILS,
  connectionFileStem,
  ensureStoreOwner,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  hostedDatabaseName,
  normalizeConnectionSecret,
  parseConnectionKey,
  parseConnectionSeed,
  readConnectionMeta,
  seedFreshStore,
  writeConnectionMeta,
}

Object.assign(module.exports, schema)
