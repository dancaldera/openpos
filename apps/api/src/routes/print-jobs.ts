import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { execute, query } from '../lib/turso.js'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'

interface DatabasePrintStation {
  id: string
  name: string
  last_seen_at: string | null
  status: 'online' | 'offline'
  created_at: string
  updated_at: string
}

interface DatabasePrintJob {
  id: string
  station_id: string
  type: 'receipt'
  status: 'pending' | 'claimed' | 'printing' | 'printed' | 'failed' | 'cancelled'
  payload_json: string
  order_id: string | null
  requested_by_user_id: string | null
  claimed_by_station_id: string | null
  claimed_at: string | null
  printed_at: string | null
  failed_at: string | null
  attempts: number
  max_attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

interface ReceiptPayload {
  title?: string
  storeInfo?: unknown
  currencySymbol?: string
  items?: unknown[]
  total?: number
}

export const printJobsRouter = new Hono()

printJobsRouter.get('/print-stations', authMiddleware, async (c) => {
  await ensureRemotePrintSchema()

  const rows = await query<DatabasePrintStation>(
    `SELECT id, name, last_seen_at, status, created_at, updated_at
       FROM print_stations
      ORDER BY name ASC`,
  )

  return c.json({ stations: rows.map(toPrintStation) })
})

printJobsRouter.post('/print-jobs', authMiddleware, async (c) => {
  await ensureRemotePrintSchema()

  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload is set by authMiddleware.
  const jwtPayload = (c as any).get('jwtPayload') as JwtPayload | undefined
  const body = await c.req.json<{
    stationId?: string
    orderId?: string
    payload?: ReceiptPayload
  }>()
  const stationId = body.stationId?.trim()

  if (!stationId) {
    return c.json({ error: 'stationId is required' }, 400)
  }

  if (!isValidReceiptPayload(body.payload)) {
    return c.json({ error: 'A valid receipt payload is required' }, 400)
  }

  const stations = await query<DatabasePrintStation>('SELECT * FROM print_stations WHERE id = ? LIMIT 1', [stationId])
  if (stations.length === 0) {
    return c.json({ error: 'Print station not found' }, 404)
  }

  const now = new Date().toISOString()
  const jobId = randomUUID()
  await execute(
    `INSERT INTO print_jobs (
       id, station_id, type, status, payload_json, order_id, requested_by_user_id,
       attempts, max_attempts, created_at, updated_at
     )
     VALUES (?, ?, 'receipt', 'pending', ?, ?, ?, 0, 3, ?, ?)`,
    [
      jobId,
      stationId,
      JSON.stringify(body.payload),
      body.orderId?.trim() || null,
      jwtPayload?.sub ? String(jwtPayload.sub) : null,
      now,
      now,
    ],
  )

  const rows = await query<DatabasePrintJob>('SELECT * FROM print_jobs WHERE id = ? LIMIT 1', [jobId])
  return c.json({ job: toPrintJob(rows[0]) }, 201)
})

printJobsRouter.get('/print-jobs/:id', authMiddleware, async (c) => {
  await ensureRemotePrintSchema()

  const rows = await query<DatabasePrintJob>('SELECT * FROM print_jobs WHERE id = ? LIMIT 1', [c.req.param('id')])
  if (rows.length === 0) {
    return c.json({ error: 'Print job not found' }, 404)
  }

  return c.json({ job: toPrintJob(rows[0]) })
})

async function ensureRemotePrintSchema(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS print_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_seen_at DATETIME,
      status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('receipt')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'printing', 'printed', 'failed', 'cancelled')),
      payload_json TEXT NOT NULL,
      order_id TEXT,
      requested_by_user_id TEXT,
      claimed_by_station_id TEXT,
      claimed_at DATETIME,
      printed_at DATETIME,
      failed_at DATETIME,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await execute(`
    CREATE INDEX IF NOT EXISTS idx_print_jobs_station_status_created
      ON print_jobs(station_id, status, created_at)
  `)
  await execute('CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id ON print_jobs(order_id)')
  await execute('CREATE INDEX IF NOT EXISTS idx_print_stations_last_seen_at ON print_stations(last_seen_at)')
}

function isValidReceiptPayload(payload: ReceiptPayload | undefined): payload is ReceiptPayload {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    Array.isArray(payload.items) &&
    payload.items.length > 0 &&
    typeof payload.total === 'number'
  )
}

function toPrintStation(row: DatabasePrintStation) {
  return {
    id: row.id,
    name: row.name,
    lastSeenAt: row.last_seen_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPrintJob(row: DatabasePrintJob) {
  return {
    id: row.id,
    stationId: row.station_id,
    type: row.type,
    status: row.status,
    orderId: row.order_id,
    requestedByUserId: row.requested_by_user_id,
    claimedByStationId: row.claimed_by_station_id,
    claimedAt: row.claimed_at,
    printedAt: row.printed_at,
    failedAt: row.failed_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
