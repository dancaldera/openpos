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

const { connect, requestApi } = vi.hoisted(() => ({
  connect: vi.fn(),
  requestApi: vi.fn(),
}))

vi.mock('../lib/api-client', () => ({
  requestApi,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({ connection: { connect } })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { CONNECTION_KEY_STORAGE, connectWithKey } = await import('./connections')

describe('desktop connectWithKey', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    connect.mockReset()
    requestApi.mockReset()
  })

  it('connects through desktop IPC with trimmed input and stores the returned key', async () => {
    const status = { status: 'syncingInitialData' as const, remoteConfigured: true, activeUserCount: 0 }
    connect.mockResolvedValueOnce({ key: 'OPK_NORMALIZED', storeName: 'Tienda', status })

    const result = await connectWithKey({ key: '  opk_raw  ', apiUrl: ' https://api.example.com ' })

    expect(connect).toHaveBeenCalledWith({ key: 'opk_raw', apiUrl: 'https://api.example.com' })
    expect(result).toEqual({ key: 'OPK_NORMALIZED', storeName: 'Tienda', status })
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_NORMALIZED')
    expect(requestApi).not.toHaveBeenCalled()
  })

  it('sends an empty API URL when none is given', async () => {
    connect.mockResolvedValue({ key: 'OPK_A', storeName: 'Tienda' })

    await connectWithKey({ key: 'OPK_A' })
    await connectWithKey({ key: 'OPK_A', apiUrl: '   ' })

    expect(connect).toHaveBeenNthCalledWith(1, { key: 'OPK_A', apiUrl: '' })
    expect(connect).toHaveBeenNthCalledWith(2, { key: 'OPK_A', apiUrl: '' })
  })

  it('does not store a key when the desktop connect fails', async () => {
    connect.mockRejectedValueOnce(new Error('invalid_connection_key'))

    await expect(connectWithKey({ key: 'bad', apiUrl: 'https://api.example.com' })).rejects.toThrow(
      'invalid_connection_key',
    )
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })
})
