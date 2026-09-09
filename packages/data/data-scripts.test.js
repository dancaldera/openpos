import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync as Database } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runRemoteMigrations, reportScriptFailure as reportRemoteFailure } from './scripts/migrate-remote.ts'
import { runBuildBootstrap, reportScriptFailure as reportBootstrapFailure } from './scripts/build-bootstrap.ts'

const tempDirs = []

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(() => {})
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-scripts-'))
  tempDirs.push(dir)
  return dir
}

describe('migrate-remote script', () => {
  it('refuses to run without a database URL', async () => {
    await expect(runRemoteMigrations({ env: { TURSO_AUTH_TOKEN: 'token' } })).rejects.toThrow(
      'TURSO_DATABASE_URL is not set in .env.local',
    )
  })

  it('refuses to run without an auth token', async () => {
    await expect(runRemoteMigrations({ env: { TURSO_DATABASE_URL: 'libsql://turso.test' } })).rejects.toThrow(
      'TURSO_AUTH_TOKEN is not set in .env.local',
    )
  })

  it('applies migrations and closes the client', async () => {
    const { createClient } = await import('@libsql/client')
    const { applyRemoteMigrations } = await import('./src/migration-runner.cjs')
    const remoteFile = join(tempDir(), 'remote.sqlite')

    const result = await runRemoteMigrations({
      env: { TURSO_DATABASE_URL: `file:${remoteFile}`, TURSO_AUTH_TOKEN: 'token' },
      createClientFn: createClient,
      applyMigrations: applyRemoteMigrations,
    })

    expect(result.appliedCount).toBeGreaterThan(0)
    expect(console.log).toHaveBeenCalledWith('OpenPOS remote Drizzle migrations')
    const database = new Database(remoteFile)
    try {
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'users'").get()).toEqual({ name: 'users' })
    } finally {
      database.close()
    }
  })

  it('handles clients without a close method', async () => {
    const result = await runRemoteMigrations({
      env: { TURSO_DATABASE_URL: 'libsql://turso.test', TURSO_AUTH_TOKEN: 'token' },
      createClientFn: () => ({}),
      applyMigrations: async () => ({ migrations: [{}, {}], appliedCount: 2, skippedCount: 0 }),
    })

    expect(result).toEqual({ migrations: [{}, {}], appliedCount: 2, skippedCount: 0 })
    expect(console.log).toHaveBeenCalledWith('Found 2 migration files')
    expect(console.log).toHaveBeenCalledWith('Applied 2, skipped 0')
  })

  it('reports failures and exits', () => {
    reportRemoteFailure(new Error('kaboom'))
    expect(console.error).toHaveBeenCalledWith('kaboom')
    expect(process.exit).toHaveBeenCalledWith(1)

    reportRemoteFailure('string boom')
    expect(console.error).toHaveBeenCalledWith('string boom')
    expect(process.exit).toHaveBeenCalledTimes(2)
  })
})

describe('build-bootstrap script', () => {
  it('writes a reproducible bootstrap database', async () => {
    const { applyLocalMigrations, migrationsTable } = await import('./src/migration-runner.cjs')
    const dbPath = join(tempDir(), 'nested', 'bootstrap.sqlite')

    const result = await runBuildBootstrap({ dbPath, applyMigrations: applyLocalMigrations, table: migrationsTable })

    expect(result.appliedCount).toBeGreaterThan(0)
    expect(console.log).toHaveBeenCalledWith(`Bootstrap database written to ${dbPath}`)
    const database = new Database(dbPath)
    try {
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'users'").get()).toEqual({ name: 'users' })
      const timestamps = database.prepare('SELECT DISTINCT applied_at AS t FROM "__drizzle_migrations"').all()
      expect(timestamps).toEqual([{ t: '1970-01-01 00:00:00' }])
    } finally {
      database.close()
    }
  })

  it('closes the database when migrations fail', async () => {
    const dbPath = join(tempDir(), 'bootstrap.sqlite')

    await expect(
      runBuildBootstrap({
        dbPath,
        applyMigrations: () => {
          throw new Error('migrate boom')
        },
        table: '__drizzle_migrations',
      }),
    ).rejects.toThrow('migrate boom')
  })

  it('reports failures and exits', () => {
    reportBootstrapFailure(new Error('kaboom'))
    expect(console.error).toHaveBeenCalledWith('kaboom')
    expect(process.exit).toHaveBeenCalledWith(1)

    reportBootstrapFailure('string boom')
    expect(console.error).toHaveBeenCalledWith('string boom')
    expect(process.exit).toHaveBeenCalledTimes(2)
  })
})
