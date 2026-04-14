try {
  module.exports = require('@openpos/sync')
} catch {
  module.exports = require('../../../packages/sync/src/index.cjs')
}
