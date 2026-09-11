import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => []),
    execute: vi.fn(async () => ({ lastInsertId: 0, rowsAffected: 0 })),
    transaction: vi.fn(async () => {}),
  },
}))

vi.mock('./api-client', () => ({
  requestApiJson: vi.fn(async () => {
    throw new Error('must not call the API on desktop')
  }),
}))

vi.mock('./desktop', () => ({
  requireDesktopApi: vi.fn(() => ({ db })),
}))

vi.mock('./platform', () => ({
  isDesktop: true,
}))

const { execute, query, transaction } = await import('./db-adapter')

describe('db-adapter on desktop', () => {
  beforeEach(() => {
    db.query.mockClear()
    db.execute.mockClear()
    db.transaction.mockClear()
    db.query.mockResolvedValue([])
    db.execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('queries through the desktop bridge', async () => {
    db.query.mockResolvedValueOnce([{ one: 1 }])
    await expect(query('SELECT 1', [1])).resolves.toEqual([{ one: 1 }])
    expect(db.query).toHaveBeenCalledWith('SELECT 1', [1])

    await query('SELECT 2')
    expect(db.query).toHaveBeenCalledWith('SELECT 2', [])
  })

  it('executes through the desktop bridge', async () => {
    await expect(execute('DELETE FROM x', [1])).resolves.toEqual({ lastInsertId: 1, rowsAffected: 1 })
    expect(db.execute).toHaveBeenCalledWith('DELETE FROM x', [1])

    await execute('DELETE FROM x')
    expect(db.execute).toHaveBeenCalledWith('DELETE FROM x', [])
  })

  it('runs transactions through the desktop bridge', async () => {
    const statements = [{ sql: 'DELETE FROM x' }, { sql: 'DELETE FROM y', params: [1] }]

    await transaction(statements)

    expect(db.transaction).toHaveBeenCalledWith(statements)
  })
})
