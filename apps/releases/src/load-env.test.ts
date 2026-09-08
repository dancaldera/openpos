import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEnvFile } from './load-env.js'

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
})
