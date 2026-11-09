import { createClient } from '@libsql/client'
import type { SqlClient } from './sql.ts'
import { ControlPlane } from './stores.ts'

/** Environment shared by the API and admin Workers (and their Node dev servers). */
export interface ControlPlaneEnv {
  CONTROL_PLANE_URL?: string
  CONTROL_PLANE_AUTH_TOKEN?: string
  /** Encrypts store database tokens at rest. Must match between API and admin. */
  CONTROL_PLANE_SECRET?: string
  /** Comma-separated parent domains for `<slug>.<domain>` store hosts. */
  STORE_BASE_DOMAINS?: string
}

export function parseBaseDomains(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

function openClient(url: string, authToken?: string): SqlClient {
  return createClient({ url, ...(authToken ? { authToken } : {}) }) as unknown as SqlClient
}

const instances = new Map<string, ControlPlane>()

/** One ControlPlane per configuration, reused across requests in the same isolate/process. */
export function controlPlaneFromEnv(env: ControlPlaneEnv): ControlPlane {
  const url = env.CONTROL_PLANE_URL?.trim()
  const secret = env.CONTROL_PLANE_SECRET?.trim()
  if (!url) throw new Error('CONTROL_PLANE_URL is not configured')
  if (!secret) throw new Error('CONTROL_PLANE_SECRET is not configured')
  const authToken = env.CONTROL_PLANE_AUTH_TOKEN?.trim() || undefined
  const baseDomains = parseBaseDomains(env.STORE_BASE_DOMAINS)
  const cacheKey = [url, authToken ?? '', secret, baseDomains.join(',')].join('|')
  let plane = instances.get(cacheKey)
  if (!plane) {
    plane = new ControlPlane({
      db: openClient(url, authToken),
      secretsKey: secret,
      openStoreDb: (config) => openClient(config.url, config.authToken),
      baseDomains,
    })
    instances.set(cacheKey, plane)
  }
  return plane
}
