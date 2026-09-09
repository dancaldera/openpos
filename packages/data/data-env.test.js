import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Direct per-file imports: nested require() calls resolve natively and would
// bypass coverage instrumentation (see vitest.config.ts).
const { getDefaultEnvCandidates, loadEnv, parseEnvFile } = await import('./src/internal/env.js')
const { defineDrizzleConfig, resolveProjectPaths } = await import('./src/internal/project-paths.js')

const tempDirs = []
const savedEnv = { ...process.env }

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, savedEnv)
  vi.restoreAllMocks()
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-env-'))
  tempDirs.push(dir)
  return dir
}

describe('parseEnvFile', () => {
  it('parses assignments and skips comments, blanks, and bare words', () => {
    const dir = tempDir()
    const filePath = join(dir, '.env')
    writeFileSync(
      filePath,
      [
        '# leading comment',
        '',
        'PLAIN=value',
        'SPACED = spaced value',
        "SINGLE='quoted'",
        'DOUBLE="quoted"',
        'EMPTY=',
        'BAREWORD',
        '   # indented comment',
        '',
      ].join('\n'),
    )

    expect(parseEnvFile(filePath)).toEqual({
      PLAIN: 'value',
      SPACED: 'spaced value',
      SINGLE: 'quoted',
      DOUBLE: 'quoted',
      EMPTY: '',
    })
  })

  it('throws for missing files', () => {
    expect(() => parseEnvFile(join(tempDir(), 'does-not-exist.env'))).toThrow()
  })
})

describe('getDefaultEnvCandidates', () => {
  it('resolves the standard candidate list from an explicit root', () => {
    expect(getDefaultEnvCandidates('/repo')).toEqual([
      resolve('/repo', '.env'),
      resolve('/repo', '.env.local'),
      resolve('/repo', 'apps/api/.env'),
      resolve('/repo', 'apps/api/.env.local'),
      resolve('/repo', 'apps/desktop/.env'),
      resolve('/repo', 'apps/desktop/.env.local'),
    ])
  })

  it('defaults to the current working directory', () => {
    expect(getDefaultEnvCandidates()).toEqual(getDefaultEnvCandidates(process.cwd()))
  })
})

describe('loadEnv', () => {
  it('merges candidates and lets the process environment win', () => {
    const dir = tempDir()
    writeFileSync(join(dir, '.env'), 'SHARED=file\nFILE_ONLY=file\n')
    writeFileSync(join(dir, '.env.local'), 'SHARED=local\nLOCAL_ONLY=local\n')
    process.env.SHARED = 'process'

    const env = loadEnv({ candidates: [join(dir, '.env'), join(dir, '.env.local'), join(dir, 'missing.env')] })

    expect(env.SHARED).toBe('process')
    expect(env.FILE_ONLY).toBe('file')
    expect(env.LOCAL_ONLY).toBe('local')
    expect(env.PATH).toBe(process.env.PATH)
  })

  it('defaults to the repo candidates under the given root', () => {
    const dir = tempDir()
    writeFileSync(join(dir, '.env'), 'FROM_REPO_ROOT=yes\n')

    const env = loadEnv({ repoRoot: dir })

    expect(env.FROM_REPO_ROOT).toBe('yes')
  })

  it('reads the default candidates from the working directory', () => {
    const env = loadEnv()

    expect(typeof env).toBe('object')
    expect(env.PATH).toBe(process.env.PATH)
  })
})

describe('project paths', () => {
  it('applies drizzle config defaults and credentials', () => {
    expect(defineDrizzleConfig({ schema: './schema', out: './drizzle' })).toEqual({
      schema: './schema',
      out: './drizzle',
      dialect: 'sqlite',
      strict: true,
      verbose: true,
    })

    expect(
      defineDrizzleConfig({
        schema: './schema',
        out: './drizzle',
        dialect: 'turso',
        strict: false,
        verbose: false,
        dbCredentials: { url: 'libsql://x', authToken: 't' },
      }),
    ).toEqual({
      schema: './schema',
      out: './drizzle',
      dialect: 'turso',
      strict: false,
      verbose: false,
      dbCredentials: { url: 'libsql://x', authToken: 't' },
    })
  })

  it('resolves package paths with defaults and overrides', () => {
    expect(resolveProjectPaths('/pkg')).toEqual({
      packageRoot: '/pkg',
      schemaPath: resolve('/pkg', 'src/schema/index.js'),
      migrationsDir: resolve('/pkg', 'drizzle'),
      bootstrapDatabasePath: resolve('/pkg', 'assets/openpos-bootstrap.sqlite'),
    })

    expect(
      resolveProjectPaths('/pkg', {
        schemaPath: 'custom/schema.js',
        migrationsDir: 'custom/drizzle',
        bootstrapDatabasePath: 'custom/bootstrap.sqlite',
      }),
    ).toEqual({
      packageRoot: '/pkg',
      schemaPath: resolve('/pkg', 'custom/schema.js'),
      migrationsDir: resolve('/pkg', 'custom/drizzle'),
      bootstrapDatabasePath: resolve('/pkg', 'custom/bootstrap.sqlite'),
    })
  })

  it('exposes the real package and repo roots', async () => {
    const project = await import('./src/project.js')

    expect(project.packageRoot).toBe(import.meta.dirname)
    expect(project.repoRoot).toBe(resolve(import.meta.dirname, '..', '..'))
    expect(project.migrationsDir).toBe(join(project.packageRoot, 'drizzle'))
    expect(project.schemaPath).toBe(join(project.packageRoot, 'src', 'schema', 'index.js'))
  })
})

describe('drizzle.config.js', () => {
  it('includes credentials when the Turso environment is set', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://turso.test'
    process.env.TURSO_AUTH_TOKEN = 'token'
    vi.resetModules()

    const config = await import('./drizzle.config.js')

    expect(config.schema).toEqual(expect.stringContaining('schema'))
    expect(config.out).toEqual(expect.stringContaining('drizzle'))
    expect(config.dbCredentials).toEqual({ url: 'libsql://turso.test', authToken: 'token' })
  })

  it('omits credentials when the Turso environment is missing', async () => {
    process.env.TURSO_DATABASE_URL = ''
    process.env.TURSO_AUTH_TOKEN = ''
    vi.resetModules()

    const config = await import('./drizzle.config.js')

    expect(config.dbCredentials).toBeUndefined()
  })
})
