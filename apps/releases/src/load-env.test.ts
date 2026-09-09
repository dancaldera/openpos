import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyEnvFile, loadLocalEnv } from './load-env.js'

const savedEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, savedEnv)
})

describe('applyEnvFile', () => {
  it('loads keys without overwriting existing env', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openpos-releases-env-'))
    const path = join(dir, '.env')
    await writeFile(
      path,
      ['# comment', 'BUCKET=from-file', "SECRET_ACCESS_KEY='quoted'", 'ENDPOINT=https://t3.storageapi.dev'].join('\n'),
    )

    const env: NodeJS.ProcessEnv = { BUCKET: 'already-set' }
    applyEnvFile(path, env)

    expect(env.BUCKET).toBe('already-set')
    expect(env.SECRET_ACCESS_KEY).toBe('quoted')
    expect(env.ENDPOINT).toBe('https://t3.storageapi.dev')
  })

  it('skips missing files, blanks, comments, and bare words', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openpos-releases-env-'))
    const env: NodeJS.ProcessEnv = {}

    expect(() => applyEnvFile(join(dir, 'does-not-exist.env'), env)).not.toThrow()
    expect(env).toEqual({})

    const path = join(dir, '.env')
    await writeFile(path, ['', '# comment', '   ', 'BAREWORD', 'KEPT=yes', 'EMPTY='].join('\n'))
    applyEnvFile(path, env)

    expect(env).toEqual({ KEPT: 'yes', EMPTY: '' })
  })

  it('strips matched quotes but keeps lone ones', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openpos-releases-env-'))
    const path = join(dir, '.env')
    await writeFile(
      path,
      ['DOUBLE="quoted"', "SINGLE='quoted'", 'LONE_DOUBLE="bare', "LONE_SINGLE='bare", 'UNQUOTED=plain'].join('\n'),
    )

    const env: NodeJS.ProcessEnv = {}
    applyEnvFile(path, env)

    expect(env).toEqual({
      DOUBLE: 'quoted',
      SINGLE: 'quoted',
      LONE_DOUBLE: '"bare',
      LONE_SINGLE: "'bare",
      UNQUOTED: 'plain',
    })
  })
})

describe('loadLocalEnv', () => {
  it('loads the service env file into an explicit env', () => {
    const env: NodeJS.ProcessEnv = {}

    expect(() => loadLocalEnv(env)).not.toThrow()
  })

  it('defaults to the process environment', () => {
    expect(() => loadLocalEnv()).not.toThrow()
  })
})
