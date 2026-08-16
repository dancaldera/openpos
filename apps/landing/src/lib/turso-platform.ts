import { getEnv, requireEnv } from './env'

const API_BASE = 'https://api.turso.tech/v1'

export class TursoApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'TursoApiError'
  }
}

export interface TursoDatabase {
  Name: string
  DbId: string
  Hostname: string
  group: string
  primaryRegion?: string
  block_reads?: boolean
  block_writes?: boolean
}

export interface TursoGroup {
  name: string
  primary?: string
  locations?: string[]
}

function getOrgConfig() {
  return {
    org: requireEnv('TURSO_ORG'),
    token: requireEnv('TURSO_API_TOKEN'),
  }
}

async function tursoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { org, token } = getOrgConfig()
  const url = `${API_BASE}/organizations/${encodeURIComponent(org)}${path}`
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const body = (await response.json()) as { error?: string }
      message = body.error ?? message
    } catch {
      message = await response.text()
    }
    throw new TursoApiError(response.status, message || `Turso API error (${response.status})`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export function toLibsqlUrl(hostname: string): string {
  return `libsql://${hostname}`
}

export async function listDatabases(group?: string): Promise<TursoDatabase[]> {
  const query = group ? `?group=${encodeURIComponent(group)}` : ''
  const result = await tursoFetch<{ databases: TursoDatabase[] }>(`/databases${query}`)
  return result.databases ?? []
}

export async function listGroups(): Promise<TursoGroup[]> {
  const result = await tursoFetch<{ groups: TursoGroup[] }>('/groups')
  return result.groups ?? []
}

export async function getDatabase(name: string): Promise<TursoDatabase> {
  const result = await tursoFetch<{ database: TursoDatabase }>(`/databases/${encodeURIComponent(name)}`)
  return result.database
}

export async function getDatabaseUsage(name: string): Promise<unknown> {
  return tursoFetch(`/databases/${encodeURIComponent(name)}/usage`)
}

export async function createDatabase(name: string, group = 'default'): Promise<TursoDatabase> {
  const result = await tursoFetch<{ database: TursoDatabase }>('/databases', {
    method: 'POST',
    body: JSON.stringify({ name, group }),
  })
  return result.database
}

export async function deleteDatabase(name: string): Promise<void> {
  await tursoFetch(`/databases/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function mintToken(
  name: string,
  options: { expiration?: string; authorization?: string } = {},
): Promise<{ jwt: string }> {
  const params = new URLSearchParams()
  if (options.expiration) params.set('expiration', options.expiration)
  if (options.authorization) params.set('authorization', options.authorization)
  const query = params.toString() ? `?${params.toString()}` : ''
  return tursoFetch<{ jwt: string }>(`/databases/${encodeURIComponent(name)}/auth/tokens${query}`, {
    method: 'POST',
  })
}

export async function rotateTokens(name: string): Promise<void> {
  await tursoFetch(`/databases/${encodeURIComponent(name)}/auth/rotate`, { method: 'POST' })
}

export async function waitForDatabase(name: string, attempts = 10, delayMs = 1500): Promise<TursoDatabase> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const database = await getDatabase(name)
      if (database.Hostname) return database
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw lastError instanceof Error ? lastError : new Error(`Database ${name} is not ready`)
}

export function isTursoConfigured(): boolean {
  return Boolean(getEnv('TURSO_ORG') && getEnv('TURSO_API_TOKEN'))
}
