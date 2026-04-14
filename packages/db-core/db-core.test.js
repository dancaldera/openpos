const { beforeEach, describe, expect, it } = require('bun:test')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { Database } = require('bun:sqlite')

const {
  buildReplicatedTableConfig,
  buildReplicatedTableMap,
  runLocalMigrations,
} = require('./src/index')

describe('@openpos/db-core local helpers', () => {
  let tempRoot

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'openpos-db-core-'))
  })

  it('creates a local sqlite connection and runs SQL migrations', () => {
    const dbPath = join(tempRoot, 'example.sqlite')
    const migrationsDir = join(tempRoot, 'drizzle')

    mkdirSync(migrationsDir, { recursive: true })
    writeFileSync(join(migrationsDir, '0000_schema.sql'), `
      CREATE TABLE example_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
    `)
    writeFileSync(join(migrationsDir, '0001_seed.sql'), `INSERT INTO example_users (name) VALUES ('Ada');`)

    const database = new Database(dbPath, { create: true })
    const result = runLocalMigrations({
      client: database,
      migrationsDir,
    })

    const rows = database.prepare('SELECT name FROM example_users').all()

    expect(result.appliedCount).toBe(2)
    expect(rows).toEqual([{ name: 'Ada' }])

    database.close()
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('derives replicated table metadata from a Drizzle table', () => {
    const { sqliteTable, integer, text } = require('drizzle-orm/sqlite-core')

    const users = sqliteTable('users', {
      id: integer('id').primaryKey({ autoIncrement: true }),
      email: text('email').notNull(),
      updatedAt: text('updated_at'),
    })

    const config = buildReplicatedTableConfig(users, {
      primaryKey: 'id',
      watermarkColumn: 'updated_at',
      deleteStrategy: 'soft',
      pullOrder: 10,
    })
    const map = buildReplicatedTableMap([config])

    expect(config).toEqual({
      tableName: 'users',
      primaryKey: 'id',
      columns: ['id', 'email', 'updated_at'],
      watermarkColumn: 'updated_at',
      deleteStrategy: 'soft',
      pullOrder: 10,
    })
    expect(map.users).toEqual(config)
  })
})
