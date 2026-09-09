import { beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

const { requestApiJson, connection, requestApi } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({})),
  requestApi: vi.fn(async () => new Response('{}', { status: 200 })),
  connection: {
    create: vi.fn(async () => ({})),
    join: vi.fn(async () => ({})),
    importRemote: vi.fn(async () => ({})),
    getRegisterPayload: vi.fn(
      async (): Promise<{ key: string; storeName: string; url?: string; authToken?: string }> => ({
        key: 'OPK_payload',
        storeName: 'Payload',
      }),
    ),
    bootstrapOwner: vi.fn(async () => ({})),
  },
}))

vi.mock('../lib/api-client', () => ({
  requestApi,
  requestApiJson,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({ connection })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const {
  bootstrapStoreOwner,
  CONNECTION_KEY_STORAGE,
  createStoreConnection,
  importStoreConnection,
  joinStoreConnection,
  registerStoreConnection,
} = await import('./connections')

describe('desktop store connections', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    requestApiJson.mockReset()
    requestApiJson.mockResolvedValue({})
    connection.create.mockReset()
    connection.join.mockReset()
    connection.importRemote.mockReset()
    connection.getRegisterPayload.mockReset()
    connection.bootstrapOwner.mockReset()
    connection.getRegisterPayload.mockResolvedValue({ key: 'OPK_payload', storeName: 'Payload' })
  })

  it('creates a store through desktop IPC and stores the key', async () => {
    connection.create.mockResolvedValueOnce({ key: 'OPK_new', storeName: 'Tienda', published: true })

    const result = await createStoreConnection({
      storeName: 'Tienda',
      adminName: 'Ana',
      adminEmail: 'ana@example.com',
      adminPassword: 'secret123',
    })

    expect(connection.create).toHaveBeenCalledWith({
      storeName: 'Tienda',
      adminName: 'Ana',
      adminEmail: 'ana@example.com',
      adminPassword: 'secret123',
    })
    expect(result.key).toBe('OPK_new')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_new')
  })

  it('joins a store through desktop IPC and stores the key', async () => {
    connection.join.mockResolvedValueOnce({ key: 'OPK_join', storeName: 'Tienda', published: true })

    const result = await joinStoreConnection({ key: 'OPK_join', seed: 'seed-words' })

    expect(connection.join).toHaveBeenCalledWith({ key: 'OPK_join', seed: 'seed-words' })
    expect(result.key).toBe('OPK_join')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_join')
  })

  it('imports a remote store through desktop IPC and stores the key', async () => {
    connection.importRemote.mockResolvedValueOnce({ key: 'OPK_imp', storeName: 'Remote', published: true })

    const result = await importStoreConnection({ url: 'libsql://remote', authToken: 'token' })

    expect(connection.importRemote).toHaveBeenCalledWith({ url: 'libsql://remote', authToken: 'token' })
    expect(result.key).toBe('OPK_imp')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_imp')
  })

  it('registers with the desktop payload including url and auth token', async () => {
    connection.getRegisterPayload.mockResolvedValueOnce({
      key: 'OPK_payload',
      storeName: 'Payload',
      url: 'libsql://remote',
      authToken: 'token',
    })
    requestApiJson.mockResolvedValueOnce({ key: 'OPK_payload', storeName: 'Payload', published: true })

    const result = await registerStoreConnection({ storeName: 'Override', adminName: 'Ana' })

    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/connections/register',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          key: 'OPK_payload',
          url: 'libsql://remote',
          authToken: 'token',
          storeName: 'Override',
          adminName: 'Ana',
        }),
      }),
    )
    expect(result.key).toBe('OPK_payload')
  })

  it('falls back to the payload store name when registering', async () => {
    requestApiJson.mockResolvedValueOnce({ key: 'OPK_payload', storeName: 'Payload', published: true })

    await registerStoreConnection({})

    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/connections/register',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ key: 'OPK_payload', storeName: 'Payload' }),
      }),
    )
  })

  it('requires a payload key to register', async () => {
    connection.getRegisterPayload.mockResolvedValueOnce({ key: '', storeName: '' })

    await expect(registerStoreConnection({})).rejects.toThrow('Store connection required')
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('bootstraps the owner through desktop IPC', async () => {
    connection.bootstrapOwner.mockResolvedValueOnce({ status: 'readyForSignIn' })

    const result = await bootstrapStoreOwner({
      storeName: 'Tienda',
      adminName: 'Ana',
      adminEmail: 'ana@example.com',
      adminPassword: 'secret123',
    })

    expect(connection.bootstrapOwner).toHaveBeenCalledWith({
      storeName: 'Tienda',
      adminName: 'Ana',
      adminEmail: 'ana@example.com',
      adminPassword: 'secret123',
    })
    expect(result).toEqual({ status: 'readyForSignIn' })
  })
})
