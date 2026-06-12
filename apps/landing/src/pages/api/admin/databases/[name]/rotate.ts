import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../../../lib/http'
import { getClient, getClientByDatabaseName, updateClientRecord } from '../../../../../lib/registry'
import { mintToken, rotateTokens, TursoApiError } from '../../../../../lib/turso-platform'

export const prerender = false

export const POST: APIRoute = async ({ params, request }) => {
  const name = params.name
  if (!name) return json({ error: 'Database name is required' }, 400)

  try {
    const body = await readJson<{ clientId?: string }>(request)
    await rotateTokens(name)

    const token = await mintToken(name, {
      expiration: 'never',
      authorization: 'full-access',
    })

    let client = body.clientId ? await getClient(body.clientId) : await getClientByDatabaseName(name)
    if (client) {
      client = await updateClientRecord(client.id, { database_token: token.jwt })
    }

    return json({ jwt: token.jwt, clientId: client?.id ?? null })
  } catch (error) {
    const status = error instanceof TursoApiError ? error.status : 500
    return json({ error: errorMessage(error) }, status)
  }
}
