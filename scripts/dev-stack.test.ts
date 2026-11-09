import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildStackEnv, DEV_DATA_DIRNAME, loadDevSecrets, randomSecret } from './dev-stack'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-dev-stack-'))
  dirs.push(dir)
  return dir
}

describe('loadDevSecrets', () => {
  it('generates secrets once and reuses them', () => {
    const dir = join(tempRoot(), 'data')
    let counter = 0
    const first = loadDevSecrets(dir, () => `s${++counter}`)
    expect(first).toEqual({ controlPlaneSecret: 's1', jwtSecret: 's2', internalSecret: 's3', adminSessionSecret: 's4' })
    expect(statSync(join(dir, 'secrets.json')).mode & 0o777).toBe(0o600)
    expect(loadDevSecrets(dir, () => 'other')).toEqual(first)
  })

  it('fills missing secrets and recovers from a corrupt file', () => {
    const dir = tempRoot()
    writeFileSync(join(dir, 'secrets.json'), JSON.stringify({ jwtSecret: 'kept', internalSecret: '' }))
    const filled = loadDevSecrets(dir, () => 'new')
    expect(filled).toMatchObject({ jwtSecret: 'kept', internalSecret: 'new' })
    expect(JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8')).internalSecret).toBe('new')

    writeFileSync(join(dir, 'secrets.json'), '{not json')
    expect(loadDevSecrets(dir, () => 'fresh').jwtSecret).toBe('fresh')
  })

  it('creates random secrets', () => {
    expect(randomSecret()).toMatch(/^[\w-]{43}$/)
  })
})

describe('buildStackEnv', () => {
  it('points every service at the local control plane and lets explicit variables win', () => {
    const root = tempRoot()
    const env = buildStackEnv(root, { PATH: '/bin', STORE_BASE_DOMAINS: 'example.test' }, () => 'secret')
    const dataDir = join(root, DEV_DATA_DIRNAME)
    expect(env).toMatchObject({
      PATH: '/bin',
      CONTROL_PLANE_URL: `file:${join(dataDir, 'control-plane.sqlite')}`,
      CONTROL_PLANE_SECRET: 'secret',
      JWT_SECRET: 'secret',
      STORE_BASE_DOMAINS: 'example.test',
      LOCAL_DATABASES_DIR: join(dataDir, 'stores'),
      STORE_WEB_URL_TEMPLATE: 'http://{slug}.localhost:5173',
    })
    expect(env.VITE_API_URL).toBeUndefined()
  })
})
