const BetterSqlite3 = require('better-sqlite3')
const { createClient } = require('@libsql/client')
const { drizzle: drizzleSqlite } = require('drizzle-orm/better-sqlite3')
const { drizzle: drizzleLibsql } = require('drizzle-orm/libsql')

function applyPragmas(client, pragmas = ['foreign_keys = ON']) {
  for (const pragma of pragmas) {
    client.pragma(pragma)
  }
}

function createLocalSqliteDb(options = {}) {
  const client = options.client ?? new BetterSqlite3(options.fileName ?? ':memory:')
  applyPragmas(client, options.pragmas)

  return {
    client,
    db: drizzleSqlite(client, {
      schema: options.schema,
    }),
  }
}

function createTursoDb(options = {}) {
  const client =
    options.client ??
    createClient({
      url: options.url,
      authToken: options.authToken,
    })

  return {
    client,
    db: drizzleLibsql(client, {
      schema: options.schema,
    }),
  }
}

module.exports = {
  createLocalSqliteDb,
  createTursoDb,
}
