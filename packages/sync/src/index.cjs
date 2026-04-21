const { replicatedTables, replicatedTablesByName } = require('@openpos/data')
const { ensureLocalSyncSchema } = require('./schema.cjs')
const { createSyncManager, resetLocalDatabase } = require('./sync-manager.cjs')

module.exports = {
  createSyncManager,
  resetLocalDatabase,
  ensureLocalSyncSchema,
  replicatedTables,
  replicatedTablesByName,
}
