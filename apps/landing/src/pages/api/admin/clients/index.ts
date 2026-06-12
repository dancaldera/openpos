import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../../lib/http'
import { applyMigrations } from '../../../../lib/migrations'
import {
  createClientRecord,
  getClientByDatabaseName,
  listClients,
} from '../../../../lib/registry'
import {
  createDatabase,
  getDatabase,
  mintToken,
  toLibsqlUrl,
  TursoApiError,
  waitForDatabase,
} from '../../../../lib/turso-platform'

export const prerender = false

export const GET: APIRoute = async () => {
  try {
    const clients = await listClients()
    return json({ clients })
  } catch (error) {
    return json({ error: errorMessage(error) }, 500)
  }
}

interface CreateClientBody {
  name?: string
  contact_email?: string
  api_url?: string
  frontend_url?: string
  notes?: string
  database_name?: string
  database_url?: string
  database_token?: string
  provision?: boolean
  group?: string
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<CreateClientBody>(request)
    const name = body.name?.trim()

    if (!name) {
      return json({ error: 'Client name is required' }, 400)
    }

    if (body.provision) {
      const databaseName = body.database_name?.trim()
      const group = body.group?.trim() || 'default'
      if (!databaseName) {
        return json({ error: 'Database name is required for provisioning' }, 400)
      }

      const steps: string[] = []
      let databaseUrl: string | null = null
      let databaseToken: string | null = null

      try {
        steps.push('create_database')
        await createDatabase(databaseName, group)

        steps.push('wait_for_database')
        const database = await waitForDatabase(databaseName)
        databaseUrl = toLibsqlUrl(database.Hostname)

        steps.push('mint_token')
        const token = await mintToken(databaseName, {
          expiration: 'never',
          authorization: 'full-access',
        })
        databaseToken = token.jwt

        steps.push('apply_migrations')
        const migrationResult = await applyMigrations(databaseUrl, databaseToken)

        steps.push('save_client')
        const client = await createClientRecord({
          name,
          contact_email: body.contact_email ?? null,
          database_name: databaseName,
          database_url: databaseUrl,
          database_token: databaseToken,
          api_url: body.api_url ?? null,
          frontend_url: body.frontend_url ?? null,
          notes: body.notes ?? null,
        })

        return json({ client, steps, migrationResult }, 201)
      } catch (error) {
        return json(
          {
            error: errorMessage(error),
            steps,
            partial: {
              database_name: databaseName,
              database_url: databaseUrl,
              database_token: databaseToken,
            },
          },
          error instanceof TursoApiError ? error.status : 500,
        )
      }
    }

    const databaseName = body.database_name?.trim() ?? null
    if (databaseName) {
      const existing = await getClientByDatabaseName(databaseName)
      if (existing) {
        return json({ error: `Database ${databaseName} is already linked to ${existing.name}` }, 409)
      }
    }

    let databaseUrl = body.database_url?.trim() ?? null
    let databaseToken = body.database_token?.trim() ?? null

    if (databaseName && !databaseUrl) {
      const database = await getDatabase(databaseName)
      databaseUrl = toLibsqlUrl(database.Hostname)
    }

    const client = await createClientRecord({
      name,
      contact_email: body.contact_email ?? null,
      database_name: databaseName,
      database_url: databaseUrl,
      database_token: databaseToken,
      api_url: body.api_url ?? null,
      frontend_url: body.frontend_url ?? null,
      notes: body.notes ?? null,
    })

    return json({ client }, 201)
  } catch (error) {
    const status = error instanceof TursoApiError ? error.status : 500
    return json({ error: errorMessage(error) }, status)
  }
}
