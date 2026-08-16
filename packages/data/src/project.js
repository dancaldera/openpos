const { resolve } = require('node:path')
const { resolveProjectPaths } = require('./internal/project-paths')

const packageRoot = resolve(__dirname, '..')
const repoRoot = resolve(packageRoot, '../..')
const projectPaths = resolveProjectPaths(packageRoot)

module.exports = {
  ...projectPaths,
  packageRoot,
  repoRoot,
}
