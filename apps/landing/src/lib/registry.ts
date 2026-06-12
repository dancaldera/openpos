import { createClient, type Client } from '@libsql/client'
import { getEnv, requireEnv } from './env'

export interface ClientRecord {
  id: string
  name: string
  contact_email: string | null
  database_name: string | null
  database_url: string | null
  database_token: string | null
  api_url: string | null
  frontend_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ClientInput = {
  name: string
  contact_email?: string | null
  database_name?: string | null
  database_url?: string | null
  database_token?: string | null
  api_url?: string | null
  frontend_url?: string | null
  notes?: string | null
}

let registryClient: Client | null = null
let schemaReady = false

function getRegistryClient(): Client {
  if (!registryClient) {
    registryClient = createClient({
      url: requireEnv('ADMIN_TURSO_DATABASE_URL'),
      authToken: requireEnv('ADMIN_TURSO_AUTH_TOKEN'),
    })
  }
  return registryClient
}

function rowToClient(row: Record<string, unknown>): ClientRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    contact_email: row.contact_email == null ? null : String(row.contact_email),
    database_name: row.database_name == null ? null : String(row.database_name),
    database_url: row.database_url == null ? null : String(row.database_url),
    database_token: row.database_token == null ? null : String(row.database_token),
    api_url: row.api_url == null ? null : String(row.api_url),
    frontend_url: row.frontend_url == null ? null : String(row.frontend_url),
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const client = getRegistryClient()
  await client.execute(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      database_name TEXT,
      database_url TEXT,
      database_token TEXT,
      api_url TEXT,
      frontend_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  schemaReady = true
}

export async function listClients(): Promise<ClientRecord[]> {
  await ensureSchema()
  const result = await getRegistryClient().execute('SELECT * FROM clients ORDER BY name ASC')
  return result.rows.map((row) => rowToClient(row as Record<string, unknown>))
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  await ensureSchema()
  const result = await getRegistryClient().execute({
    sql: 'SELECT * FROM clients WHERE id = ?',
    args: [id],
  })
  const row = result.rows[0]
  return row ? rowToClient(row as Record<string, unknown>) : null
}

export async function getClientByDatabaseName(databaseName: string): Promise<ClientRecord | null> {
  await ensureSchema()
  const result = await getRegistryClient().execute({
    sql: 'SELECT * FROM clients WHERE database_name = ?',
    args: [databaseName],
  })
  const row = result.rows[0]
  return row ? rowToClient(row as Record<string, unknown>) : null
}

export async function createClientRecord(input: ClientInput): Promise<ClientRecord> {
  await ensureSchema()
  const id = crypto.randomUUID()
  await getRegistryClient().execute({
    sql: `
      INSERT INTO clients (
        id, name, contact_email, database_name, database_url, database_token,
        api_url, frontend_url, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      input.name,
      input.contact_email ?? null,
      input.database_name ?? null,
      input.database_url ?? null,
      input.database_token ?? null,
      input.api_url ?? null,
      input.frontend_url ?? null,
      input.notes ?? null,
    ],
  })
  const created = await getClient(id)
  if (!created) throw new Error('Failed to create client record')
  return created
}

export async function updateClientRecord(id: string, input: Partial<ClientInput>): Promise<ClientRecord> {
  await ensureSchema()
  const existing = await getClient(id)
  if (!existing) throw new Error('Client not found')

  const next = {
    name: input.name ?? existing.name,
    contact_email: input.contact_email !== undefined ? input.contact_email : existing.contact_email,
    database_name: input.database_name !== undefined ? input.database_name : existing.database_name,
    database_url: input.database_url !== undefined ? input.database_url : existing.database_url,
    database_token: input.database_token !== undefined ? input.database_token : existing.database_token,
    api_url: input.api_url !== undefined ? input.api_url : existing.api_url,
    frontend_url: input.frontend_url !== undefined ? input.frontend_url : existing.frontend_url,
    notes: input.notes !== undefined ? input.notes : existing.notes,
  }

  await getRegistryClient().execute({
    sql: `
      UPDATE clients
      SET
        name = ?,
        contact_email = ?,
        database_name = ?,
        database_url = ?,
        database_token = ?,
        api_url = ?,
        frontend_url = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [
      next.name,
      next.contact_email,
      next.database_name,
      next.database_url,
      next.database_token,
      next.api_url,
      next.frontend_url,
      next.notes,
      id,
    ],
  })

  const updated = await getClient(id)
  if (!updated) throw new Error('Failed to update client record')
  return updated
}

export async function deleteClientRecord(id: string): Promise<void> {
  await ensureSchema()
  await getRegistryClient().execute({
    sql: 'DELETE FROM clients WHERE id = ?',
    args: [id],
  })
}

export function isRegistryConfigured(): boolean {
  return Boolean(getEnv('ADMIN_TURSO_DATABASE_URL') && getEnv('ADMIN_TURSO_AUTH_TOKEN'))
}
