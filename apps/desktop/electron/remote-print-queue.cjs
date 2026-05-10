const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_POLL_INTERVAL_MS = 3_000
const DEFAULT_MAX_ATTEMPTS = 3

function normalizeString(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function getRows(result) {
  if (!result || !Array.isArray(result.rows)) {
    return []
  }

  if (result.rows.length === 0 || !Array.isArray(result.rows[0])) {
    return result.rows
  }

  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index] ?? null])))
}

async function ensureRemotePrintSchema(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS print_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_seen_at DATETIME,
      status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await client.execute(`
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
      max_attempts INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_ATTEMPTS},
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_print_jobs_station_status_created
      ON print_jobs(station_id, status, created_at)
  `)
  await client.execute('CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id ON print_jobs(order_id)')
  await client.execute('CREATE INDEX IF NOT EXISTS idx_print_stations_last_seen_at ON print_stations(last_seen_at)')
}

async function upsertPrintStation(client, stationId, stationName) {
  const now = new Date().toISOString()

  await client.execute(
    `INSERT INTO print_stations (id, name, last_seen_at, status, created_at, updated_at)
     VALUES (?, ?, ?, 'online', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       last_seen_at = excluded.last_seen_at,
       status = 'online',
       updated_at = excluded.updated_at`,
    [stationId, stationName || stationId, now, now, now],
  )
}

async function selectNextPendingJob(client, stationId) {
  const result = await client.execute(
    `SELECT *
       FROM print_jobs
      WHERE station_id = ?
        AND status = 'pending'
        AND attempts < max_attempts
      ORDER BY created_at ASC
      LIMIT 1`,
    [stationId],
  )

  return getRows(result)[0] ?? null
}

async function claimPrintJob(client, stationId, jobId) {
  const now = new Date().toISOString()
  await client.execute(
    `UPDATE print_jobs
        SET status = 'claimed',
            claimed_by_station_id = ?,
            claimed_at = ?,
            attempts = attempts + 1,
            updated_at = ?
      WHERE id = ?
        AND station_id = ?
        AND status = 'pending'`,
    [stationId, now, now, jobId, stationId],
  )

  const claimed = await client.execute('SELECT * FROM print_jobs WHERE id = ? LIMIT 1', [jobId])
  const row = getRows(claimed)[0] ?? null
  if (row?.status !== 'claimed' || row?.claimed_by_station_id !== stationId || row?.claimed_at !== now) {
    return null
  }

  return row
}

async function updatePrintJobStatus(client, jobId, status, updates = {}) {
  const now = new Date().toISOString()
  const fields = ['status = ?', 'updated_at = ?']
  const params = [status, now]

  if (updates.printedAt) {
    fields.push('printed_at = ?')
    params.push(updates.printedAt)
  }

  if (updates.failedAt) {
    fields.push('failed_at = ?')
    params.push(updates.failedAt)
  }

  if (updates.lastError !== undefined) {
    fields.push('last_error = ?')
    params.push(updates.lastError)
  }

  params.push(jobId)
  await client.execute(`UPDATE print_jobs SET ${fields.join(', ')} WHERE id = ?`, params)
}

function parseReceiptPayload(job) {
  if (!job || job.type !== 'receipt') {
    throw new Error(`Unsupported print job type: ${job?.type || 'unknown'}`)
  }

  try {
    return JSON.parse(String(job.payload_json || ''))
  } catch (error) {
    throw new Error(`Print job payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function createRemotePrintQueue(options) {
  const {
    getClient,
    getRuntimeConfig,
    printReceipt,
    logger = console,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options

  let heartbeatTimer = null
  let pollTimer = null
  let running = false
  let processing = false
  let clientPromise = null

  function getStationConfig() {
    const runtime = getRuntimeConfig()
    const config = runtime?.config ?? {}
    const stationId =
      normalizeString(config.printStationId) ||
      normalizeString(config.print_station_id) ||
      normalizeString(process.env.OPENPOS_PRINT_STATION_ID)
    const stationName =
      normalizeString(config.printStationName) ||
      normalizeString(config.print_station_name) ||
      normalizeString(process.env.OPENPOS_PRINT_STATION_NAME) ||
      stationId

    return { stationId, stationName }
  }

  async function getEnsuredClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const client = await getClient()
        if (!client) {
          throw new Error('Remote database is not configured')
        }
        await ensureRemotePrintSchema(client)
        return client
      })()
    }

    try {
      return await clientPromise
    } catch (error) {
      clientPromise = null
      throw error
    }
  }

  async function heartbeat() {
    const { stationId, stationName } = getStationConfig()
    if (!stationId) {
      return
    }

    const client = await getEnsuredClient()
    await upsertPrintStation(client, stationId, stationName)
  }

  async function processNextJob() {
    if (processing) {
      return
    }

    const { stationId } = getStationConfig()
    if (!stationId) {
      return
    }

    processing = true
    try {
      const client = await getEnsuredClient()
      const pendingJob = await selectNextPendingJob(client, stationId)
      if (!pendingJob) {
        return
      }

      const claimedJob = await claimPrintJob(client, stationId, pendingJob.id)
      if (!claimedJob) {
        return
      }

      await updatePrintJobStatus(client, claimedJob.id, 'printing')

      try {
        const receiptPayload = parseReceiptPayload(claimedJob)
        await printReceipt(JSON.stringify(receiptPayload))
        await updatePrintJobStatus(client, claimedJob.id, 'printed', {
          printedAt: new Date().toISOString(),
          lastError: null,
        })
      } catch (error) {
        const attempts = Number(claimedJob.attempts ?? 1)
        const maxAttempts = Number(claimedJob.max_attempts ?? DEFAULT_MAX_ATTEMPTS)
        const finalStatus = attempts >= maxAttempts ? 'failed' : 'pending'
        await updatePrintJobStatus(client, claimedJob.id, finalStatus, {
          failedAt: finalStatus === 'failed' ? new Date().toISOString() : undefined,
          lastError: error instanceof Error ? error.message : String(error),
        })
      }
    } catch (error) {
      logger.error?.('[remote-print] queue processing failed', error)
    } finally {
      processing = false
    }
  }

  function start() {
    if (running) {
      return
    }

    const { stationId } = getStationConfig()
    if (!stationId) {
      logger.warn?.('[remote-print] printStationId is not configured; remote print queue disabled')
      return
    }

    running = true
    void heartbeat().catch((error) => logger.error?.('[remote-print] heartbeat failed', error))
    void processNextJob()
    heartbeatTimer = setInterval(() => {
      void heartbeat().catch((error) => logger.error?.('[remote-print] heartbeat failed', error))
    }, heartbeatIntervalMs)
    pollTimer = setInterval(() => {
      void processNextJob()
    }, pollIntervalMs)
  }

  function stop() {
    running = false
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return {
    start,
    stop,
    heartbeat,
    processNextJob,
  }
}

module.exports = {
  createRemotePrintQueue,
  ensureRemotePrintSchema,
  upsertPrintStation,
}
