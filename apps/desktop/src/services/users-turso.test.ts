import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({
  query: vi.fn(async () => []),
}))

vi.mock('../lib/db-adapter', () => ({
  query,
}))

const { userService } = await import('./users-turso')

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: 'ada@example.com',
    password: 'hashed',
    name: 'Ada',
    role: 'admin',
    permissions: '["*"]',
    created_at: '2026-01-01T00:00:00.000Z',
    last_login: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('UserService', () => {
  beforeEach(() => {
    query.mockReset()
    query.mockResolvedValue([])
  })

  it('gets a user by id or returns null', async () => {
    query.mockResolvedValueOnce([dbUser()])
    const found = await userService.getUser('1')
    expect(found).toMatchObject({ id: '1', email: 'ada@example.com', permissions: ['*'] })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM users WHERE id'), [1])

    query.mockReset()
    query.mockResolvedValueOnce([])
    await expect(userService.getUser('2')).resolves.toBeNull()
  })

  it('returns null when getUser fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      query.mockRejectedValueOnce(new Error('db down'))
      await expect(userService.getUser('1')).resolves.toBeNull()
      expect(error).toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  it('lists users or returns an empty array', async () => {
    query.mockResolvedValueOnce([dbUser(), dbUser({ id: 2, email: 'b@example.com', last_login: undefined })])
    const users = await userService.getUsers()
    expect(users).toHaveLength(2)
    expect(users[1].lastLogin).toBeUndefined()
  })

  it('returns an empty array when getUsers fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      query.mockRejectedValueOnce(new Error('db down'))
      await expect(userService.getUsers()).resolves.toEqual([])
    } finally {
      error.mockRestore()
    }
  })
})
