const schema = require('./schema')
const { replicatedTables, replicatedTablesByName } = require('./replicated-tables')

module.exports = {
  ...schema,
  schema,
  replicatedTables,
  replicatedTablesByName,
}
