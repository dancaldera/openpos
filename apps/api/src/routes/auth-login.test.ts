import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateConnectionKey } from '@openpos/data'
import bcrypt from 'bcryptjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const connectionsDir = mkdtempSync(join(tmpdir(), 'openpos-api-auth-login-'))

process.env.JWT_SECRET = 'auth-login-test-secret-auth-login-test-secret'
process.env.OPENPOS_CONNECTIONS_DIR = connectionsDir

const { app } = await import('../index')

const adminPassword = 'Admin123!'
const memberPin = '246810'

afterEach(() => {
  rmSync(connectionsDir, { recursive: true, force: true })
})

async function createStoreAndLogin() {
  const createResponse = await app.request('/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeName: 'Corner Shop',
      adminName: 'Ada Admin',
      adminEmail: 'ada@example.com',
      adminPassword,
    }),
  })
  expect(createResponse.status).toBe(201)
  const created = (await createResponse.json()) as { key: string }

  const loginResponse = await app.request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OpenPOS-Connection': created.key,
    },
    body: JSON.stringify({
      email: 'ada@example.com',
      password: adminPassword,
    }),
  })
  expect(loginResponse.status).toBe(200)
  const login = (await loginResponse.json()) as {
    token: string
    user: { id: string; email: string; pinEnabled?: boolean }
  }

  return { key: created.key, token: login.token, user: login.user }
}

async function setUserPin(key: string, token: string, userId: string, pin: string | null) {
  const response = await app.request('/api/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-OpenPOS-Connection': key,
    },
    body: JSON.stringify({
      sql: 'UPDATE users SET pin_enabled = ?, pin_hash = ?, updated_at = ? WHERE id = ?',
      params: [pin === null ? 0 : 1, pin === null ? null : await bcrypt.hash(pin, 12), new Date().toISOString(), Number(userId)],
    }),
  })
  expect(response.status).toBe(200)
}

describe('PIN login', () => {
  beforeEach(() => {
    rmSync(connectionsDir, { recursive: true, force: true })
  })

  it('lists pinEnabled without hashes, then signs in with a 6-digit PIN', async () => {
    const { key, token, user } = await createStoreAndLogin()

    const usersBefore = await app.request('/api/auth/users', {
      headers: { 'X-OpenPOS-Connection': key },
    })
    expect(usersBefore.status).toBe(200)
    const listedBefore = (await usersBefore.json()) as {
      users: Array<{ id: string; pinEnabled: boolean; pin_hash?: string; pinHash?: string }>
    }
    expect(listedBefore.users).toEqual([
      expect.objectContaining({ id: user.id, email: 'ada@example.com', pinEnabled: false }),
    ])
    expect(listedBefore.users[0].pin_hash).toBeUndefined()
    expect(listedBefore.users[0].pinHash).toBeUndefined()

    await setUserPin(key, token, user.id, memberPin)

    const usersAfter = await app.request('/api/auth/users', {
      headers: { 'X-OpenPOS-Connection': key },
    })
    const listedAfter = (await usersAfter.json()) as { users: Array<{ pinEnabled: boolean }> }
    expect(listedAfter.users[0].pinEnabled).toBe(true)

    const pinLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': key,
      },
      body: JSON.stringify({ userId: user.id, pin: memberPin }),
    })
    expect(pinLogin.status).toBe(200)
    const pinSession = (await pinLogin.json()) as { token: string; user: { email: string; pinEnabled: boolean } }
    expect(pinSession.token).toEqual(expect.any(String))
    expect(pinSession.user).toMatchObject({ email: 'ada@example.com', pinEnabled: true })
  })

  it('rejects a wrong PIN, a disabled PIN, and does not register a store', async () => {
    const { key, token, user } = await createStoreAndLogin()

    const disabledLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': key,
      },
      body: JSON.stringify({ userId: user.id, pin: memberPin }),
    })
    expect(disabledLogin.status).toBe(401)
    expect(await disabledLogin.json()).toEqual({ error: 'Invalid PIN' })

    await setUserPin(key, token, user.id, memberPin)

    const wrongPin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': key,
      },
      body: JSON.stringify({ userId: user.id, pin: '000000' }),
    })
    expect(wrongPin.status).toBe(401)
    expect(await wrongPin.json()).toEqual({ error: 'Invalid PIN' })

    await setUserPin(key, token, user.id, null)

    const afterDisable = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': key,
      },
      body: JSON.stringify({ userId: user.id, pin: memberPin }),
    })
    expect(afterDisable.status).toBe(401)

    const unregistered = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': generateConnectionKey(),
      },
      body: JSON.stringify({ userId: '1', pin: memberPin }),
    })
    expect(unregistered.status).toBe(401)
    expect(await unregistered.json()).toEqual({ error: 'Store connection required' })
  })
})
