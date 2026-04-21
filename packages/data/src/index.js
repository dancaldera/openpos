const schema = require('./schema')
const { replicatedTables, replicatedTablesByName } = require('./replicated-tables')
const { migrationsDir } = require('./project')

module.exports = {
  ...schema,
  schema,
  replicatedTables,
  replicatedTablesByName,
  migrationsDir,
}
