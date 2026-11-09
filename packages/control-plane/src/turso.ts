/**
 * Minimal Turso Platform API client.
 * https://docs.turso.tech/api-reference
 */

export interface TursoPlatformConfig {
  apiToken: string
  org: string
  group: string
  baseUrl?: string
  fetch?: typeof fetch
}

export interface TursoDatabase {
  name: string
  id: string | null
  hostname: string
  group: string | null
  regions: string[]
  primaryRegion: string | null
}

export class TursoPlatformError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'TursoPlatformError'
  }
}

type RawDatabase = Record<string, unknown>

function toDatabase(raw: RawDatabase, org: string): TursoDatabase {
  const name = String(raw.Name ?? raw.name ?? '')
  return {
    name,
    id: (raw.DbId ?? raw.dbId ?? null) as string | null,
    hostname: String(raw.Hostname ?? raw.hostname ?? `${name}-${org}.turso.io`),
    group: (raw.group ?? null) as string | null,
    regions: Array.isArray(raw.regions) ? (raw.regions as string[]) : [],
    primaryRegion: (raw.primaryRegion ?? null) as string | null,
  }
}

export class TursoPlatform {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: TursoPlatformConfig) {
    if (!config.apiToken || !config.org) {
      throw new Error('Turso API token and organization are required')
    }
    this.baseUrl = (config.baseUrl ?? 'https://api.turso.tech').replace(/\/+$/, '')
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init))
  }

  get org(): string {
    return this.config.org
  }

  get group(): string {
    return this.config.group
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/organizations/${encodeURIComponent(this.config.org)}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
    )
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      throw new TursoPlatformError(payload?.error || `Turso API request failed (${response.status})`, response.status)
    }
    return (await response.json().catch(() => ({}))) as T
  }

  async listDatabases(): Promise<TursoDatabase[]> {
    const payload = await this.request<{ databases?: RawDatabase[] }>('/databases')
    return (payload.databases ?? []).map((raw) => toDatabase(raw, this.config.org))
  }

  async getDatabase(name: string): Promise<TursoDatabase | null> {
    try {
      const payload = await this.request<{ database?: RawDatabase }>(`/databases/${encodeURIComponent(name)}`)
      return payload.database ? toDatabase(payload.database, this.config.org) : null
    } catch (error) {
      if (error instanceof TursoPlatformError && error.status === 404) return null
      throw error
    }
  }

  async createDatabase(name: string, group = this.config.group): Promise<TursoDatabase> {
    const payload = await this.request<{ database?: RawDatabase }>('/databases', {
      method: 'POST',
      body: JSON.stringify({ name, group: group || 'default' }),
    })
    return toDatabase(payload.database ?? { Name: name }, this.config.org)
  }

  async deleteDatabase(name: string): Promise<void> {
    await this.request(`/databases/${encodeURIComponent(name)}`, { method: 'DELETE' })
  }

  async createToken(name: string, options: { expiration?: string; authorization?: 'full-access' | 'read-only' } = {}) {
    const query = new URLSearchParams({
      expiration: options.expiration ?? 'never',
      authorization: options.authorization ?? 'full-access',
    })
    const payload = await this.request<{ jwt?: string }>(
      `/databases/${encodeURIComponent(name)}/auth/tokens?${query.toString()}`,
      { method: 'POST' },
    )
    if (!payload.jwt) throw new Error('Turso did not return a database token')
    return payload.jwt
  }

  async listGroups(): Promise<Array<{ name: string; locations: string[] }>> {
    const payload = await this.request<{ groups?: Array<Record<string, unknown>> }>('/groups')
    return (payload.groups ?? []).map((group) => ({
      name: String(group.name ?? ''),
      locations: Array.isArray(group.locations) ? (group.locations as string[]) : [],
    }))
  }
}
