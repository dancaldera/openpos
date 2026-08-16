const { describe, expect, it, mock } = require('bun:test')
const { createRemotePrintQueue, ensureRemotePrintSchema } = require('./remote-print-queue.cjs')

function createFakeClient(initialJobs = []) {
  const calls = []
  const stations = new Map()
  const jobs = new Map(initialJobs.map((job) => [job.id, { ...job }]))

  return {
    calls,
    stations,
    jobs,
    async execute(sql, params = []) {
      calls.push({ sql, params })
      const normalized = sql.replace(/\s+/g, ' ').trim()

      if (normalized.startsWith('INSERT INTO print_stations')) {
        stations.set(params[0], {
          id: params[0],
          name: params[1],
          last_seen_at: params[2],
          status: 'online',
          created_at: params[3],
          updated_at: params[4],
        })
        return { rows: [], columns: [], rowsAffected: 1 }
      }

      if (normalized.startsWith('SELECT * FROM print_jobs') && normalized.includes("status = 'pending'")) {
        const stationId = params[0]
        const row = [...jobs.values()]
          .filter((job) => job.station_id === stationId && job.status === 'pending' && job.attempts < job.max_attempts)
          .sort((left, right) => left.created_at.localeCompare(right.created_at))[0]
        return { rows: row ? [row] : [], columns: Object.keys(row ?? {}) }
      }

      if (normalized.startsWith('UPDATE print_jobs') && normalized.includes("status = 'claimed'")) {
        const [stationId, claimedAt, updatedAt, jobId] = params
        const job = jobs.get(jobId)
        if (!job || job.station_id !== stationId || job.status !== 'pending') {
          return { rows: [], columns: [], rowsAffected: 0 }
        }

        job.status = 'claimed'
        job.claimed_by_station_id = stationId
        job.claimed_at = claimedAt
        job.updated_at = updatedAt
        job.attempts += 1
        return { rows: [], columns: [], rowsAffected: 1 }
      }

      if (normalized === 'SELECT * FROM print_jobs WHERE id = ? LIMIT 1') {
        const row = jobs.get(params[0])
        return { rows: row ? [row] : [], columns: Object.keys(row ?? {}) }
      }

      if (normalized.startsWith('UPDATE print_jobs SET status = ?')) {
        const status = params[0]
        const jobId = params.at(-1)
        const job = jobs.get(jobId)
        if (job) {
          job.status = status
          job.updated_at = params[1]
          if (status === 'printed') {
            job.printed_at = params[2]
            job.last_error = null
          }
          if (status === 'failed') {
            job.failed_at = params[2]
            job.last_error = params[3]
          }
          if (status === 'pending') {
            job.last_error = params[2]
          }
        }
        return { rows: [], columns: [], rowsAffected: job ? 1 : 0 }
      }

      return { rows: [], columns: [], rowsAffected: 0 }
    },
  }
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

describe('ensureRemotePrintSchema', () => {
  it('creates the remote print tables and indexes idempotently', async () => {
    const client = createFakeClient()

    await ensureRemotePrintSchema(client)
    await ensureRemotePrintSchema(client)

    expect(client.calls.filter((call) => call.sql.includes('CREATE TABLE IF NOT EXISTS print_stations'))).toHaveLength(2)
    expect(client.calls.filter((call) => call.sql.includes('CREATE TABLE IF NOT EXISTS print_jobs'))).toHaveLength(2)
    expect(client.calls.filter((call) => call.sql.includes('idx_print_jobs_station_status_created'))).toHaveLength(2)
  })
})

describe('createRemotePrintQueue', () => {
  it('does not poll when printStationId is missing', () => {
    const getClient = mock(async () => createFakeClient())
    const logger = { warn: mock(() => {}), error: mock(() => {}) }
    const queue = createRemotePrintQueue({
      getClient,
      getRuntimeConfig: () => ({ config: {} }),
      printReceipt: mock(async () => 'printed'),
      logger,
      heartbeatIntervalMs: 50,
      pollIntervalMs: 50,
    })

    queue.start()
    queue.stop()

    expect(getClient).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('heartbeats and marks a claimed job as printed', async () => {
    const client = createFakeClient([
      {
        id: 'job-1',
        station_id: 'front-counter-1',
        type: 'receipt',
        status: 'pending',
        payload_json: JSON.stringify(receiptPayload),
        attempts: 0,
        max_attempts: 3,
        created_at: '2026-05-10T10:00:00.000Z',
        updated_at: '2026-05-10T10:00:00.000Z',
      },
    ])
    const printReceipt = mock(async () => 'printed')
    const queue = createRemotePrintQueue({
      getClient: async () => client,
      getRuntimeConfig: () => ({ config: { printStationId: 'front-counter-1', printStationName: 'Front Counter' } }),
      printReceipt,
    })

    await queue.heartbeat()
    await queue.processNextJob()

    expect(client.stations.get('front-counter-1')?.status).toBe('online')
    expect(printReceipt).toHaveBeenCalled()
    expect(client.jobs.get('job-1')?.status).toBe('printed')
  })

  it('retries failed jobs and marks them failed after max attempts', async () => {
    const client = createFakeClient([
      {
        id: 'job-1',
        station_id: 'front-counter-1',
        type: 'receipt',
        status: 'pending',
        payload_json: JSON.stringify(receiptPayload),
        attempts: 0,
        max_attempts: 2,
        created_at: '2026-05-10T10:00:00.000Z',
        updated_at: '2026-05-10T10:00:00.000Z',
      },
    ])
    const queue = createRemotePrintQueue({
      getClient: async () => client,
      getRuntimeConfig: () => ({ config: { printStationId: 'front-counter-1' } }),
      printReceipt: mock(async () => {
        throw new Error('Printer offline')
      }),
    })

    await queue.processNextJob()
    expect(client.jobs.get('job-1')?.status).toBe('pending')
    expect(client.jobs.get('job-1')?.attempts).toBe(1)

    await queue.processNextJob()
    expect(client.jobs.get('job-1')?.status).toBe('failed')
    expect(client.jobs.get('job-1')?.last_error).toBe('Printer offline')
  })
})
