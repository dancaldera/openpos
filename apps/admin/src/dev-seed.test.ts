import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { ControlPlane, type DataPlaneConfig } from '@openpos/control-plane'
import { localProvisioner } from '@openpos/control-plane/local'
import { afterEach, describe, expect, it } from 'vitest'
import { DEV_OWNER, DEV_ROOT, describeDevStack, seedDevStack } from './dev-seed.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup(dir = mkdtempSync(join(tmpdir(), 'openpos-seed-'))) {
  dirs.push(dir)
  const plane = new ControlPlane({
    db: createClient({ url: `file:${join(dir, 'control.sqlite')}` }),
    secretsKey: 'k',
    openStoreDb: (config: DataPlaneConfig) => createClient(config),
    baseDomains: ['localhost'],
  })
  return { dir, plane, provisioner: localProvisioner(join(dir, 'stores')) }
}

describe('seedDevStack', () => {
  it('creates the root user and demo store once, then reuses them', async () => {
    const { plane, provisioner } = setup()
    const first = await seedDevStack(plane, provisioner)
    expect(first).toMatchObject({ createdRoot: true, createdStore: true })
    expect(await plane.authenticateRoot(DEV_ROOT.email, DEV_ROOT.password)).not.toBeNull()
    expect((await plane.findStore({ host: 'demo.localhost:5173' }))?.connectionKey).toBe(first.connectionKey)

    const again = await seedDevStack(plane, provisioner)
    expect(again).toEqual({ createdRoot: false, createdStore: false, connectionKey: first.connectionKey })

    const summary = describeDevStack(
      { STORE_WEB_URL_TEMPLATE: 'http://{slug}.localhost:5173', PUBLIC_API_URL: 'http://localhost:3001' },
      again,
    )
    expect(summary).toContain('http://demo.localhost:5173')
    expect(summary).toContain(DEV_OWNER.email)
    expect(summary).toContain(first.connectionKey)
  })

  it('re-attaches the demo database when the control plane was reset', async () => {
    const { dir, plane, provisioner } = setup()
    const first = await seedDevStack(plane, provisioner)
    rmSync(join(dir, 'control.sqlite'), { force: true })

    const fresh = setup(dir)
    const second = await seedDevStack(fresh.plane, fresh.provisioner)
    expect(second).toMatchObject({ createdRoot: true, createdStore: true, connectionKey: first.connectionKey })
  })
})
