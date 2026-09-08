const { getTableConfig } = require('drizzle-orm/sqlite-core')

function buildReplicatedTableConfig(table, options) {
  const config = getTableConfig(table)

  return {
    tableName: config.name,
    primaryKey: options.primaryKey,
    columns: config.columns.map((column) => column.name),
    watermarkColumn: options.watermarkColumn,
    deleteStrategy: options.deleteStrategy,
    pullOrder: options.pullOrder,
  }
}

function buildReplicatedTableMap(configs) {
  return Object.fromEntries(configs.map((config) => [config.tableName, config]))
}

module.exports = {
  buildReplicatedTableConfig,
  buildReplicatedTableMap,
}
