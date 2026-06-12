import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../../lib/http'
import { deleteClientRecord, getClient, updateClientRecord } from '../../../../lib/registry'
import { getDatabase, toLibsqlUrl, TursoApiError } from '../../../../lib/turso-platform'

export const prerender = false

export const GET: APIRoute = async ({ params }) => {
  const id = params.id
  if (!id) return json({ error: 'Client id is required' }, 400)

  try {
    const client = await getClient(id)
    if (!client) return json({ error: 'Client not found' }, 404)
    return json({ client })
  } catch (error) {
    return json({ error: errorMessage(error) }, 500)
  }
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id
  if (!id) return json({ error: 'Client id is required' }, 400)

  try {
    const body = await readJson<{
      name?: string
      contact_email?: string | null
      api_url?: string | null
      frontend_url?: string | null
      notes?: string | null
      database_name?: string | null
      database_url?: string | null
      database_token?: string | null
    }>(request)

    let databaseUrl = body.database_url
    if (body.database_name && !databaseUrl) {
      const database = await getDatabase(body.database_name)
      databaseUrl = toLibsqlUrl(database.Hostname)
    }

    const client = await updateClientRecord(id, {
      ...body,
      database_url: databaseUrl,
    })
    return json({ client })
  } catch (error) {
    const status = error instanceof TursoApiError ? error.status : 500
    return json({ error: errorMessage(error) }, status === 404 ? 404 : status)
  }
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id
  if (!id) return json({ error: 'Client id is required' }, 400)

  try {
    const existing = await getClient(id)
    if (!existing) return json({ error: 'Client not found' }, 404)
    await deleteClientRecord(id)
    return json({ ok: true })
  } catch (error) {
    return json({ error: errorMessage(error) }, 500)
  }
}
