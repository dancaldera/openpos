import {
  type ControlPlane,
  type ControlPlaneEnv,
  controlPlaneFromEnv,
  type DatabaseProvisioner,
  parseBaseDomains,
  tursoProvisioner,
} from '@openpos/control-plane'
import { CloudflareCustomHostnames, CloudflareWorkerDomains } from './cloudflare.ts'

export interface AdminEnv extends ControlPlaneEnv {
  /** Signs root session cookies. */
  ADMIN_SESSION_SECRET?: string
  /** Lets the first root user be created from /setup. */
  ADMIN_SETUP_TOKEN?: string
  TURSO_API_TOKEN?: string
  TURSO_ORG?: string
  TURSO_GROUP?: string
  /**
   * Cloudflare API token. With CLOUDFLARE_ACCOUNT_ID it publishes store web hosts
   * as Workers Custom Domains (needs Workers Scripts: Edit); with
   * CLOUDFLARE_ZONE_ID it registers Cloudflare for SaaS custom hostnames for
   * domains outside STORE_BASE_DOMAINS (needs SSL and Certificates: Edit).
   */
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_ZONE_ID?: string
  /** Zone that holds STORE_BASE_DOMAINS, when it differs from the base domain itself. */
  CLOUDFLARE_ZONE_NAME?: string
  /** Worker that serves the web client. Defaults to openpos-web. */
  WEB_WORKER_NAME?: string
  /** CNAME target shown to store owners adding a custom domain. */
  CUSTOM_DOMAIN_TARGET?: string
  PUBLIC_API_URL?: string
  RELEASES_URL?: string
  /** Store web address, e.g. https://{slug}.pos.example.com */
  STORE_WEB_URL_TEMPLATE?: string
  /** Node dev only: directory for local SQLite store databases when Turso is not configured. */
  LOCAL_DATABASES_DIR?: string
  ADMIN_PORT?: string
}

export interface AdminServices {
  controlPlane: (env: AdminEnv) => ControlPlane
  provisioner: (env: AdminEnv) => DatabaseProvisioner | null
  customHostnames: (env: AdminEnv) => CloudflareCustomHostnames | null
  workerDomains: (env: AdminEnv) => CloudflareWorkerDomains | null
  fetch: typeof fetch
}

export function defaultProvisioner(env: AdminEnv, fetchImpl?: typeof fetch): DatabaseProvisioner | null {
  const apiToken = env.TURSO_API_TOKEN?.trim()
  const org = env.TURSO_ORG?.trim()
  if (!apiToken || !org) return null
  return tursoProvisioner({ apiToken, org, group: env.TURSO_GROUP?.trim() || 'default', fetch: fetchImpl })
}

export function defaultCustomHostnames(env: AdminEnv, fetchImpl?: typeof fetch): CloudflareCustomHostnames | null {
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim()
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim()
  if (!apiToken || !zoneId) return null
  return new CloudflareCustomHostnames({ apiToken, zoneId, fetch: fetchImpl })
}

export function defaultWorkerDomains(env: AdminEnv, fetchImpl?: typeof fetch): CloudflareWorkerDomains | null {
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim()
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (!apiToken || !accountId) return null
  return new CloudflareWorkerDomains({
    apiToken,
    accountId,
    service: env.WEB_WORKER_NAME?.trim() || 'openpos-web',
    zoneName: env.CLOUDFLARE_ZONE_NAME?.trim() || undefined,
    fetch: fetchImpl,
  })
}

export function defaultServices(overrides: Partial<AdminServices> = {}): AdminServices {
  const fetchImpl = overrides.fetch ?? ((input, init) => fetch(input, init))
  return {
    controlPlane: controlPlaneFromEnv,
    provisioner: (env) => defaultProvisioner(env, fetchImpl),
    customHostnames: (env) => defaultCustomHostnames(env, fetchImpl),
    workerDomains: (env) => defaultWorkerDomains(env, fetchImpl),
    ...overrides,
    fetch: fetchImpl,
  }
}

export function storeWebUrl(env: AdminEnv, slug: string): string | null {
  const template = env.STORE_WEB_URL_TEMPLATE?.trim()
  if (template) return template.replaceAll('{slug}', slug)
  const [base] = parseBaseDomains(env.STORE_BASE_DOMAINS)
  return base ? `https://${slug}.${base}` : null
}

/** Store web host under the first base domain, e.g. aldo.pos.example.com. */
export function primaryWebHost(env: AdminEnv, slug: string): string | null {
  const [base] = parseBaseDomains(env.STORE_BASE_DOMAINS)
  return base ? `${slug}.${base}` : null
}

/** Hosts under a base domain are Workers Custom Domains, not Cloudflare for SaaS hostnames. */
export function isPlatformHost(env: AdminEnv, host: string): boolean {
  return parseBaseDomains(env.STORE_BASE_DOMAINS).some((base) => host === base || host.endsWith(`.${base}`))
}
