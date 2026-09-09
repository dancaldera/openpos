import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestApiJson } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({})),
}))

vi.mock('./api-client', () => ({
  requestApiJson,
}))

vi.mock('./desktop', () => ({
  requireDesktopApi: vi.fn(() => {
    throw new Error('must not use the bridge on web')
  }),
}))

vi.mock('./platform', () => ({
  isDesktop: false,
}))

const { execute, query, transaction } = await import('./db-adapter')

describe('db-adapter on web', () => {
  beforeEach(() => {
    requestApiJson.mockReset()
    requestApiJson.mockResolvedValue({})
  })

  it('queries through the API', async () => {
    requestApiJson.mockResolvedValueOnce({ rows: [{ one: 1 }] })

    await expect(query('SELECT 1', [1])).resolves.toEqual([{ one: 1 }])
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/query',
      expect.objectContaining({ method: 'POST', body: { sql: 'SELECT 1', params: [1] } }),
    )

    requestApiJson.mockReset()
    requestApiJson.mockResolvedValueOnce({ rows: [] })
    await query('SELECT 2')
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/query',
      expect.objectContaining({ body: { sql: 'SELECT 2', params: [] } }),
    )
  })

  it('executes through the API with defaulted counts', async () => {
    requestApiJson.mockResolvedValueOnce({ lastInsertId: 5, rowsAffected: 2 })
    await expect(execute('DELETE FROM x', [1])).resolves.toEqual({ lastInsertId: 5, rowsAffected: 2 })

    requestApiJson.mockReset()
    requestApiJson.mockResolvedValueOnce({})
    await expect(execute('DELETE FROM x')).resolves.toEqual({ lastInsertId: 0, rowsAffected: 0 })
  })

  it('runs transactions statement by statement', async () => {
    await transaction([{ sql: 'DELETE FROM x' }, { sql: 'DELETE FROM y', params: [1] }])

    expect(requestApiJson).toHaveBeenCalledTimes(2)
    expect(requestApiJson).toHaveBeenNthCalledWith(
      1,
      '/api/execute',
      expect.objectContaining({ body: { sql: 'DELETE FROM x', params: [] } }),
    )
    expect(requestApiJson).toHaveBeenNthCalledWith(
      2,
      '/api/execute',
      expect.objectContaining({ body: { sql: 'DELETE FROM y', params: [1] } }),
    )
  })
})
