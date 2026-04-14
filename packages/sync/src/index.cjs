const { replicatedTables, replicatedTablesByName } = require('@openpos/data')
const { ensureLocalSyncSchema } = require('./schema.cjs')
const { createSyncManager } = require('./sync-manager.cjs')

module.exports = {
  createSyncManager,
  ensureLocalSyncSchema,
  replicatedTables,
  replicatedTablesByName,
}
