import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEnv, reportFailure, runCreateAdmin, type CreateAdminDeps } from './create-admin.js'

const tempDirs: string[] = []

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(((() => {}) as unknown) as never)
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-create-admin-'))
  tempDirs.push(dir)
  return dir
}

describe('loadEnv', () => {
  it('parses assignments and skips comments, blanks, and bare words', () => {
    const path = join(tempDir(), '.env')
    writeFileSync(path, ['', '# comment', '   ', 'BAREWORD', 'KEY=value', 'SPACED = spaced', 'EMPTY='].join('\n'))

    expect(loadEnv(path)).toEqual({ KEY: 'value', SPACED: 'spaced', EMPTY: '' })
  })
})

describe('runCreateAdmin', () => {
  const deps = (overrides: Partial<CreateAdminDeps> = {}): CreateAdminDeps => ({
    envPath: join(tempDir(), '.env'),
    loadEnvFile: () => ({ TURSO_DATABASE_URL: 'libsql://test', TURSO_AUTH_TOKEN: 'token' }),
    createClient: () => ({ execute: async () => ({ rows: [] }) }),
    hashPassword: async (password: string) => `hashed:${password}`,
    ...overrides,
  })

  it('creates an admin with default identity', async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = []

    await runCreateAdmin(
      [],
      deps({
        createClient: () => ({
          execute: async (sql: string, params?: unknown[]) => {
            calls.push({ sql, params })
            return { rows: [] }
          },
        }),
      }),
    )

    expect(calls).toHaveLength(2)
    const select = calls.find((call) => call.sql.startsWith('SELECT'))
    const insert = calls.find((call) => call.sql.startsWith('INSERT'))
    expect(select?.params).toEqual(['admin@danpos.com'])
    expect(insert?.params?.slice(0, 3)).toEqual(['admin@danpos.com', 'hashed:admin123', 'Admin User'])
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('admin@danpos.com'))
  })

  it('uses explicit identity and lowercases the email', async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = []

    await runCreateAdmin(
      ['Ada@Example.COM', 'Ada Admin', 's3cret'],
      deps({
        createClient: () => ({
          execute: async (sql: string, params?: unknown[]) => {
            calls.push({ sql, params })
            return { rows: [] }
          },
        }),
      }),
    )

    expect(calls.find((call) => call.sql.startsWith('SELECT'))?.params).toEqual(['ada@example.com'])
    expect(calls.find((call) => call.sql.startsWith('INSERT'))?.params?.slice(0, 3)).toEqual([
      'ada@example.com',
      'hashed:s3cret',
      'Ada Admin',
    ])
  })

  it('exits when database credentials are missing', async () => {
    await runCreateAdmin([], deps({ loadEnvFile: () => ({}) }))
    expect(process.exit).toHaveBeenCalledWith(1)

    await runCreateAdmin([], deps({ loadEnvFile: () => ({ TURSO_DATABASE_URL: 'libsql://test' }) }))
    expect(process.exit).toHaveBeenCalledTimes(2)
  })

  it('exits when the user already exists', async () => {
    const createClient = vi.fn(() => ({ execute: async () => ({ rows: [{ id: 1 }] }) }))

    await runCreateAdmin(['ada@example.com'], deps({ createClient }))

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith('Error: User already exists: ada@example.com')
  })
})

describe('reportFailure', () => {
  it('reports the message and exits', () => {
    reportFailure(new Error('kaboom'))

    expect(console.error).toHaveBeenCalledWith('Error:', 'kaboom')
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})
