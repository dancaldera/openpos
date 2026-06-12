import { createClient } from '@libsql/client'
import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../lib/http'
import { getClient } from '../../../lib/registry'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<{ clientId?: string; sql?: string; params?: unknown[] }>(request)
    const clientId = body.clientId?.trim()
    const sql = body.sql?.trim()

    if (!clientId || !sql) {
      return json({ error: 'clientId and sql are required' }, 400)
    }

    const clientRecord = await getClient(clientId)
    if (!clientRecord?.database_url || !clientRecord.database_token) {
      return json({ error: 'Selected client does not have database credentials' }, 400)
    }

    const started = performance.now()
    const client = createClient({
      url: clientRecord.database_url,
      authToken: clientRecord.database_token,
    })

    try {
      const result = await client.execute({
        sql,
        args: body.params ?? [],
      })
      const durationMs = Math.round(performance.now() - started)

      const columns = result.columns ?? []
      const rows = result.rows.map((row) => {
        if (Array.isArray(row)) return row
        return columns.map((column) => (row as Record<string, unknown>)[column])
      })

      return json({
        columns,
        rows,
        rowsAffected: result.rowsAffected ?? 0,
        durationMs,
      })
    } finally {
      client.close()
    }
  } catch (error) {
    return json({ error: errorMessage(error) }, 400)
  }
}
