import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'

const execute = mock(
  async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
    lastInsertId: 0,
    rowsAffected: 1,
  }),
)
const query = mock(async (_sql: string, _params?: unknown[]): Promise<Array<Record<string, unknown>>> => [])

mock.module('../lib/turso.js', () => ({
  execute,
  query,
}))

const { printJobsRouter } = await import('./print-jobs')

process.env.JWT_SECRET = 'print-jobs-test-secret'

const authToken = jwt.sign(
  {
    sub: '7',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    permissions: [],
  },
  process.env.JWT_SECRET,
)

function createApp() {
  const app = new Hono()
  app.route('/api', printJobsRouter)
  return app
}

const receiptPayload = {
  title: 'Receipt',
  storeInfo: { name: 'Store', appName: 'OpenPOS' },
  currencySymbol: '$',
  items: [{ name: 'Coffee', quantity: 1, price: 10, total: 10 }],
  subtotal: 10,
  tax: 0,
  taxRate: 0,
  total: 10,
  footer: 'Thanks',
  date: '2026-05-10',
  time: '12:00 PM',
}

describe('printJobsRouter', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
  })

  it('lists print stations after ensuring the remote print schema', async () => {
    query.mockResolvedValueOnce([
      {
        id: 'front-counter-1',
        name: 'Front Counter',
        last_seen_at: '2026-05-10T10:00:00.000Z',
        status: 'online',
        created_at: '2026-05-10T09:00:00.000Z',
        updated_at: '2026-05-10T10:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/print-stations', {
      headers: { Authorization: `Bearer ${authToken}` },
    })

    expect(response.status).toBe(200)
    expect(execute).toHaveBeenCalledTimes(5)
    expect(await response.json()).toEqual({
      stations: [
        {
          id: 'front-counter-1',
          name: 'Front Counter',
          lastSeenAt: '2026-05-10T10:00:00.000Z',
          status: 'online',
          createdAt: '2026-05-10T09:00:00.000Z',
          updatedAt: '2026-05-10T10:00:00.000Z',
        },
      ],
    })
  })

  it('creates a pending receipt print job for an existing station', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 'front-counter-1',
          name: 'Front Counter',
          last_seen_at: '2026-05-10T10:00:00.000Z',
          status: 'online',
          created_at: '2026-05-10T09:00:00.000Z',
          updated_at: '2026-05-10T10:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'job-1',
          station_id: 'front-counter-1',
          type: 'receipt',
          status: 'pending',
          payload_json: JSON.stringify(receiptPayload),
          order_id: '42',
          requested_by_user_id: '7',
          claimed_by_station_id: null,
          claimed_at: null,
          printed_at: null,
          failed_at: null,
          attempts: 0,
          max_attempts: 3,
          last_error: null,
          created_at: '2026-05-10T10:00:00.000Z',
          updated_at: '2026-05-10T10:00:00.000Z',
        },
      ])

    const response = await createApp().request('/api/print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        stationId: 'front-counter-1',
        orderId: '42',
        payload: receiptPayload,
      }),
    })

    expect(response.status).toBe(201)
    expect(execute).toHaveBeenCalledTimes(6)
    expect(await response.json()).toEqual({
      job: {
        id: 'job-1',
        stationId: 'front-counter-1',
        type: 'receipt',
        status: 'pending',
        orderId: '42',
        requestedByUserId: '7',
        claimedByStationId: null,
        claimedAt: null,
        printedAt: null,
        failedAt: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: '2026-05-10T10:00:00.000Z',
        updatedAt: '2026-05-10T10:00:00.000Z',
      },
    })
  })

  it('rejects jobs for unknown stations', async () => {
    query.mockResolvedValueOnce([])

    const response = await createApp().request('/api/print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        stationId: 'missing',
        payload: receiptPayload,
      }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Print station not found' })
  })
})
