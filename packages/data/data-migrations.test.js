import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync as Database } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
// Direct per-file imports: nested require() calls resolve natively and would
// bypass coverage instrumentation (see vitest.config.ts).
const { applyLocalMigrations, applyRemoteMigrations, migrationsTable } = await import('./src/migration-runner.cjs')
const { migrationsDir } = await import('./src/project.js')

// A legacy database ran migrations 0000-0004 before the migration-history
// table existed, so it has the old schema with no recorded history.
function buildLegacyDatabase(file) {
  const database = new Database(file)
  try {
    for (const name of [
      '0000_openpos_schema',
      '0001_required_seeds',
      '0002_password_recovery_codes',
      '0003_password_reset_settings',
      '0004_password_reset_tokens',
    ]) {
      database.exec(readFileSync(join(migrationsDir, `${name}.sql`), 'utf-8'))
    }
    database.exec("INSERT INTO users (email, password, name, role, permissions) VALUES ('legacy@example.com', 'x', 'Legacy', 'admin', '[]')")
  } finally {
    database.close()
  }
}

const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-migrations-'))
  tempDirs.push(dir)
  return dir
}

describe('local migration history', () => {
  it('seeds legacy history for databases created before the migration table', () => {
    const file = join(tempDir(), 'legacy.sqlite')
    buildLegacyDatabase(file)
    const database = new Database(file)
    try {
      const result = applyLocalMigrations(database)

      const history = database
        .prepare(`SELECT name FROM "${migrationsTable}" ORDER BY name`)
        .all()
        .map((row) => row.name)
      expect(history).toEqual(
        expect.arrayContaining([
          '0000_openpos_schema',
          '0001_required_seeds',
          '0002_password_recovery_codes',
          '0003_password_reset_settings',
          '0004_password_reset_tokens',
        ]),
      )
      expect(history).toHaveLength(result.migrations.length)
      expect(result.skippedCount).toBeGreaterThanOrEqual(5)
      expect(result.appliedCount).toBe(result.migrations.length - result.skippedCount)
      expect(database.prepare('SELECT email FROM users WHERE id = 1').get()).toEqual({
        email: 'legacy@example.com',
      })
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'connection_meta'").get()).toEqual({
        name: 'connection_meta',
      })
    } finally {
      database.close()
    }
  })

  it('skips everything when the database is already migrated', () => {
    const database = new Database(join(tempDir(), 'migrated.sqlite'))
    try {
      const first = applyLocalMigrations(database)
      expect(first.appliedCount).toBeGreaterThan(0)

      const second = applyLocalMigrations(database)
      expect(second.appliedCount).toBe(0)
      expect(second.skippedCount).toBe(first.migrations.length)
    } finally {
      database.close()
    }
  })
})

describe('remote migrations', () => {
  it('migrates a fresh remote database without legacy history', async () => {
    const { createClient } = await import('@libsql/client')
    const client = createClient({ url: `file:${join(tempDir(), 'remote.sqlite')}`, authToken: 'token' })
    try {
      const result = await applyRemoteMigrations(client)

      expect(result.appliedCount).toBeGreaterThan(0)
      const tables = await client.execute("SELECT name FROM sqlite_master WHERE name = 'users'")
      expect(tables.rows.length).toBe(1)
      const history = await client.execute(`SELECT name FROM "${migrationsTable}" ORDER BY name`)
      expect(history.rows.length).toBe(result.migrations.length)
    } finally {
      client.close()
    }
  })

  it('seeds legacy history on remote databases that predate the migration table', async () => {
    const file = join(tempDir(), 'remote.sqlite')
    buildLegacyDatabase(file)
    const { createClient } = await import('@libsql/client')
    const client = createClient({ url: `file:${file}`, authToken: 'token' })
    try {
      const result = await applyRemoteMigrations(client)

      expect(result.skippedCount).toBeGreaterThanOrEqual(5)
      const users = await client.execute('SELECT email FROM users WHERE id = 1')
      expect(users.rows.length).toBe(1)
      const settings = await client.execute("SELECT name FROM sqlite_master WHERE name = 'connection_meta'")
      expect(settings.rows.length).toBe(1)
    } finally {
      client.close()
    }
  })

  it('skips everything when the remote database is already migrated', async () => {
    const { createClient } = await import('@libsql/client')
    const client = createClient({ url: `file:${join(tempDir(), 'remote.sqlite')}`, authToken: 'token' })
    try {
      const first = await applyRemoteMigrations(client)
      expect(first.appliedCount).toBeGreaterThan(0)

      const second = await applyRemoteMigrations(client)
      expect(second.appliedCount).toBe(0)
      expect(second.skippedCount).toBe(first.migrations.length)
    } finally {
      client.close()
    }
  })
})
