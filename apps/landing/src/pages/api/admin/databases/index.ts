import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../../lib/http'
import { listClients } from '../../../../lib/registry'
import {
  createDatabase,
  listDatabases,
  listGroups,
  toLibsqlUrl,
  TursoApiError,
} from '../../../../lib/turso-platform'

export const prerender = false

export const GET: APIRoute = async () => {
  try {
    const [databases, groups, clients] = await Promise.all([
      listDatabases(),
      listGroups(),
      listClients(),
    ])

    const clientByDatabase = new Map(
      clients.filter((client) => client.database_name).map((client) => [client.database_name!, client]),
    )

    return json({
      databases: databases.map((database) => ({
        name: database.Name,
        hostname: database.Hostname,
        url: toLibsqlUrl(database.Hostname),
        group: database.group,
        client: clientByDatabase.get(database.Name) ?? null,
      })),
      groups,
    })
  } catch (error) {
    const status = error instanceof TursoApiError ? error.status : 500
    return json({ error: errorMessage(error) }, status)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<{ name?: string; group?: string }>(request)
    const name = body.name?.trim()
    const group = body.group?.trim() || 'default'

    if (!name) {
      return json({ error: 'Database name is required' }, 400)
    }

    const database = await createDatabase(name, group)
    return json({
      database: {
        name: database.Name,
        hostname: database.Hostname,
        url: toLibsqlUrl(database.Hostname),
        group: database.group,
      },
    }, 201)
  } catch (error) {
    const status = error instanceof TursoApiError ? error.status : 500
    return json({ error: errorMessage(error) }, status)
  }
}
