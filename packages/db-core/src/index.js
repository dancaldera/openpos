const { defineProjectConfig, resolveProjectPaths } = require('./config')
const { createLocalSqliteDb, createTursoDb } = require('./clients')
const { getDefaultEnvCandidates, loadEnv, parseEnvFile } = require('./env')
const { loadMigrationFiles, loadSqlMigrations, splitStatements } = require('./migration-files')
const { DEFAULT_MIGRATIONS_TABLE, runLocalMigrations, runTursoMigrations } = require('./migrator')
const { buildReplicatedTableConfig, buildReplicatedTableMap } = require('./sync-metadata')

module.exports = {
  DEFAULT_MIGRATIONS_TABLE,
  buildReplicatedTableConfig,
  buildReplicatedTableMap,
  createLocalSqliteDb,
  createTursoDb,
  defineProjectConfig,
  getDefaultEnvCandidates,
  loadEnv,
  loadMigrationFiles,
  loadSqlMigrations,
  parseEnvFile,
  resolveProjectPaths,
  runLocalMigrations,
  runTursoMigrations,
  splitStatements,
}
