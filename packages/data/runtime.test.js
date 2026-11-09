import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

import { generatedModulePath, readMigrationFiles, renderMigrationsModule } from './scripts/generate-migrations-module.ts'

const runtime = require('./src/runtime.js')

describe('embedded migrations module', () => {
  it('matches the Drizzle migration folder', () => {
    const expected = renderMigrationsModule(readMigrationFiles())
    expect(readFileSync(generatedModulePath, 'utf8')).toBe(expected)
  })

  it('returns no migrations for an empty folder listing', () => {
    expect(renderMigrationsModule([])).toContain('module.exports = [\n]')
  })
})

describe('applyStoreMigrations', () => {
  it('migrates a fresh database once and is idempotent', async () => {
    const client = createClient({ url: ':memory:' })
    const first = await runtime.applyStoreMigrations(client)
    expect(first.appliedCount).toBe(runtime.migrations.length)
    const second = await runtime.applyStoreMigrations(client)
    expect(second.appliedCount).toBe(0)
    expect(second.skippedCount).toBe(runtime.migrations.length)
    const meta = await client.execute("SELECT name FROM sqlite_master WHERE name = 'connection_meta'")
    expect(meta.rows.length).toBe(1)
    expect(runtime.latestMigrationName()).toBe(runtime.migrations.at(-1).name)
    client.close()
  })

  it('seeds legacy history for databases created before the migrations table', async () => {
    const client = createClient({ url: ':memory:' })
    for (const statement of runtime.migrations[0].sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await client.execute(statement)
    }
    const result = await runtime.applyStoreMigrations(client)
    expect(result.skippedCount).toBeGreaterThanOrEqual(1)
    const history = await client.execute(`SELECT name FROM "${runtime.migrationsTable}" ORDER BY id`)
    expect(history.rows.map((row) => row.name)).toContain('0000_openpos_schema')
    client.close()
  })

  it('generates parseable connection keys', () => {
    const key = runtime.generateConnectionKey()
    expect(runtime.parseConnectionKey(key)).toBe(key)
  })
})
