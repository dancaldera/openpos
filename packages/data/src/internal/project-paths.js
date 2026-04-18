const { resolve } = require('node:path')

function defineDrizzleConfig(options) {
  const config = {
    schema: options.schema,
    out: options.out,
    dialect: options.dialect ?? 'sqlite',
    strict: options.strict ?? true,
    verbose: options.verbose ?? true,
  }

  if (options.dbCredentials) {
    config.dbCredentials = options.dbCredentials
  }

  return config
}

function resolveProjectPaths(packageRoot, options = {}) {
  return {
    packageRoot,
    schemaPath: resolve(packageRoot, options.schemaPath ?? 'src/schema/index.js'),
    migrationsDir: resolve(packageRoot, options.migrationsDir ?? 'drizzle'),
    devMigrationsDir: resolve(packageRoot, options.devMigrationsDir ?? 'drizzle/dev'),
    bootstrapDatabasePath: resolve(packageRoot, options.bootstrapDatabasePath ?? 'assets/openpos-bootstrap.sqlite'),
  }
}

module.exports = {
  defineDrizzleConfig,
  resolveProjectPaths,
}
