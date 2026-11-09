import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { ControlPlane, type DataPlaneConfig } from '@openpos/control-plane'
import { localProvisioner } from '@openpos/control-plane/local'
import { generateConnectionKey } from '@openpos/data'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { setControlPlaneForTests } from '../lib/stores.js'
import { resetDataPlaneClientsForTests } from '../lib/turso.js'

const dir = mkdtempSync(join(tmpdir(), 'openpos-api-auth-login-'))
const savedEnv = { ...process.env }
const adminPassword = 'Admin123!'
const memberPin = '246810'
let key: string

beforeAll(async () => {
  process.env.JWT_SECRET = 'auth-login-test-secret-auth-login-test-secret'
  delete process.env.DEFAULT_STORE
  const plane = new ControlPlane({
    db: createClient({ url: `file:${join(dir, 'control.sqlite')}` }),
    secretsKey: 'auth-login-test-control-plane',
    openStoreDb: (config: DataPlaneConfig) => createClient(config),
    baseDomains: ['openpos.xyz'],
  })
  setControlPlaneForTests(plane)
  const created = await plane.createStore(localProvisioner(join(dir, 'stores')), {
    name: 'Corner Shop',
    slug: 'corner',
    owner: { name: 'Ada Admin', email: 'ada@example.com', password: adminPassword },
  })
  key = created.connectionKey
})

afterAll(() => {
  setControlPlaneForTests(null)
  resetDataPlaneClientsForTests()
  process.env = savedEnv
  rmSync(dir, { recursive: true, force: true })
})

function login(body: Record<string, unknown>, connectionKey = key) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenPOS-Connection': connectionKey },
    body: JSON.stringify(body),
  })
}

async function passwordLogin() {
  const response = await login({ email: 'ada@example.com', password: adminPassword })
  expect(response.status).toBe(200)
  return (await response.json()) as { token: string; user: { id: string; email: string; pinEnabled?: boolean } }
}

async function setUserPin(token: string, userId: string, pin: string | null) {
  const response = await app.request('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sql: 'UPDATE users SET pin_enabled = ?, pin_hash = ?, updated_at = ? WHERE id = ?',
      params: [
        pin === null ? 0 : 1,
        pin === null ? null : await bcrypt.hash(pin, 12),
        new Date().toISOString(),
        Number(userId),
      ],
    }),
  })
  expect(response.status).toBe(200)
}

async function listUsers() {
  const response = await app.request('/api/auth/users', { headers: { 'X-OpenPOS-Connection': key } })
  expect(response.status).toBe(200)
  return (await response.json()) as {
    users: Array<{ id: string; email: string; pinEnabled: boolean; pin_hash?: string; pinHash?: string }>
  }
}

describe('PIN login', () => {
  it('lists pinEnabled without hashes, then signs in with a 6-digit PIN', async () => {
    const { token, user } = await passwordLogin()

    const before = await listUsers()
    expect(before.users).toEqual([
      expect.objectContaining({ id: user.id, email: 'ada@example.com', pinEnabled: false }),
    ])
    expect(before.users[0].pin_hash).toBeUndefined()
    expect(before.users[0].pinHash).toBeUndefined()

    await setUserPin(token, user.id, memberPin)

    const after = await listUsers()
    expect(after.users[0].pinEnabled).toBe(true)

    const pinLogin = await login({ userId: user.id, pin: memberPin })
    expect(pinLogin.status).toBe(200)
    const pinSession = (await pinLogin.json()) as {
      token: string
      user: { email: string; pinEnabled: boolean }
      store: { slug: string }
    }
    expect(pinSession.token).toEqual(expect.any(String))
    expect(pinSession.user).toMatchObject({ email: 'ada@example.com', pinEnabled: true })
    expect(pinSession.store.slug).toBe('corner')

    await setUserPin(token, user.id, null)
  })

  it('rejects a wrong PIN, a disabled PIN, and unknown stores', async () => {
    const { token, user } = await passwordLogin()

    const disabledLogin = await login({ userId: user.id, pin: memberPin })
    expect(disabledLogin.status).toBe(401)
    expect(await disabledLogin.json()).toEqual({ error: 'Invalid PIN' })

    await setUserPin(token, user.id, memberPin)

    const wrongPin = await login({ userId: user.id, pin: '000000' })
    expect(wrongPin.status).toBe(401)
    expect(await wrongPin.json()).toEqual({ error: 'Invalid PIN' })

    await setUserPin(token, user.id, null)

    const afterDisable = await login({ userId: user.id, pin: memberPin })
    expect(afterDisable.status).toBe(401)

    const unregistered = await login({ userId: '1', pin: memberPin }, generateConnectionKey())
    expect(unregistered.status).toBe(404)
    expect(await unregistered.json()).toEqual({ error: 'connection_not_found' })
  })
})
