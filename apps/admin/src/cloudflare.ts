/**
 * Cloudflare API clients used by the admin app:
 * - Workers Custom Domains put store web hosts (aldo.pos.example.com) on the
 *   shared web Worker. https://developers.cloudflare.com/api/resources/workers/subresources/domains/
 * - Cloudflare for SaaS custom hostnames serve store domains outside the
 *   platform zone (pos.example.com). https://developers.cloudflare.com/api/resources/custom_hostnames/
 */

const API_BASE = 'https://api.cloudflare.com/client/v4'

interface CloudflareEnvelope<T> {
  success?: boolean
  errors?: Array<{ message?: string }>
  result?: T
}

interface ClientConfig {
  apiToken: string
  baseUrl?: string
  fetch?: typeof fetch
}

class CloudflareClient {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: ClientConfig) {
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init))
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = (this.config.baseUrl ?? API_BASE).replace(/\/+$/, '')
    const response = await this.fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    const payload = (await response.json().catch(() => ({}))) as CloudflareEnvelope<T>
    if (!response.ok || payload.success === false) {
      const message = payload.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join('; ')
      throw new Error(message || `Cloudflare API request failed (${response.status})`)
    }
    return payload.result as T
  }
}

export interface CustomHostname {
  id: string
  hostname: string
  status: string
  sslStatus: string | null
}

function toHostname(raw: Record<string, unknown>): CustomHostname {
  const ssl = (raw.ssl ?? {}) as { status?: string }
  return {
    id: String(raw.id ?? ''),
    hostname: String(raw.hostname ?? ''),
    status: String(raw.status ?? 'unknown'),
    sslStatus: ssl.status ?? null,
  }
}

export class CloudflareCustomHostnames {
  private readonly client: CloudflareClient
  private readonly zonePath: string

  constructor(config: ClientConfig & { zoneId: string }) {
    this.client = new CloudflareClient(config)
    this.zonePath = `/zones/${encodeURIComponent(config.zoneId)}`
  }

  async find(hostname: string): Promise<CustomHostname | null> {
    const result = await this.client.request<Array<Record<string, unknown>>>(
      `${this.zonePath}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    )
    const match = (result ?? []).map(toHostname).find((entry) => entry.hostname === hostname)
    return match ?? null
  }

  async create(hostname: string): Promise<CustomHostname> {
    const existing = await this.find(hostname)
    if (existing) return existing
    const result = await this.client.request<Record<string, unknown>>(`${this.zonePath}/custom_hostnames`, {
      method: 'POST',
      body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv' } }),
    })
    return toHostname(result ?? { hostname })
  }

  async remove(hostname: string): Promise<boolean> {
    const existing = await this.find(hostname)
    if (!existing) return false
    await this.client.request(`${this.zonePath}/custom_hostnames/${encodeURIComponent(existing.id)}`, {
      method: 'DELETE',
    })
    return true
  }
}

export interface WorkerDomain {
  id: string
  hostname: string
  service: string
}

export class CloudflareWorkerDomains {
  private readonly client: CloudflareClient
  private readonly accountPath: string

  constructor(private readonly config: ClientConfig & { accountId: string; service: string; zoneName?: string }) {
    this.client = new CloudflareClient(config)
    this.accountPath = `/accounts/${encodeURIComponent(config.accountId)}/workers/domains`
  }

  get service(): string {
    return this.config.service
  }

  async find(hostname: string): Promise<WorkerDomain | null> {
    const result = await this.client.request<Array<Record<string, unknown>>>(
      `${this.accountPath}?hostname=${encodeURIComponent(hostname)}`,
    )
    const match = (result ?? []).find((entry) => entry.hostname === hostname)
    return match ? { id: String(match.id ?? ''), hostname, service: String(match.service ?? '') } : null
  }

  /** Point hostname at the web Worker. Cloudflare creates the DNS record and certificate. */
  async attach(hostname: string): Promise<WorkerDomain> {
    const result = await this.client.request<Record<string, unknown>>(this.accountPath, {
      method: 'PUT',
      body: JSON.stringify({
        hostname,
        service: this.config.service,
        ...(this.config.zoneName ? { zone_name: this.config.zoneName } : {}),
      }),
    })
    return { id: String(result?.id ?? ''), hostname, service: this.config.service }
  }

  /** Detach hostname, but only when it points at the web Worker. */
  async detach(hostname: string): Promise<boolean> {
    const existing = await this.find(hostname)
    if (!existing || existing.service !== this.config.service) return false
    await this.client.request(`${this.accountPath}/${encodeURIComponent(existing.id)}`, { method: 'DELETE' })
    return true
  }
}
