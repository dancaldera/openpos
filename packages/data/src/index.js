const schema = require('./schema')
const { replicatedTables, replicatedTablesByName } = require('./replicated-tables')
const { applyLocalMigrations, applyRemoteMigrations, migrationsTable } = require('./migration-runner.cjs')
const { migrationsDir } = require('./project')

module.exports = {
  ...schema,
  schema,
  replicatedTables,
  replicatedTablesByName,
  applyLocalMigrations,
  applyRemoteMigrations,
  migrationsDir,
  migrationsTable,
}
