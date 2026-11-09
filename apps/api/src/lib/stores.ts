/**
 * Store resolution through the control plane.
 *
 * The API is shared by every store. Each request is mapped to one store by
 * its session token, its connection key header, or the web host it came from
 * (<slug>.pos.softmelody.dev or a custom domain); DEFAULT_STORE covers single-store
 * setups and plain localhost development.
 */

import {
  type ControlPlane,
  controlPlaneFromEnv,
  type DataPlaneConfig,
  type StoreLookup,
  type StoreRecord,
} from '@openpos/control-plane'
import { parseConnectionKey } from '@openpos/data/src/runtime.js'

export interface ResolvedStore {
  store: StoreRecord
  dataPlane: DataPlaneConfig
}

const HIT_TTL_MS = 30_000
const MISS_TTL_MS = 5_000

let override: ControlPlane | null = null
const cache = new Map<string, { value: ResolvedStore | null; expiresAt: number }>()
const migrations = new Map<string, Promise<unknown>>()

export function getControlPlane(): ControlPlane {
  return override ?? controlPlaneFromEnv(process.env)
}

export function setControlPlaneForTests(plane: ControlPlane | null): void {
  override = plane
  clearStoreCache()
}

export function clearStoreCache(): void {
  cache.clear()
  migrations.clear()
}

/** Apply pending migrations once per store per process/isolate. */
function ensureMigrated(plane: ControlPlane, storeId: string): Promise<unknown> {
  let pending = migrations.get(storeId)
  if (!pending) {
    pending = plane.migrateStore(storeId)
    pending.catch(() => migrations.delete(storeId))
    migrations.set(storeId, pending)
  }
  return pending
}

async function lookup(plane: ControlPlane, query: StoreLookup): Promise<ResolvedStore | null> {
  const store = await plane.findStore(query)
  if (store?.status !== 'active') return null
  await ensureMigrated(plane, store.id)
  return { store, dataPlane: await plane.dataPlaneFor(store.id) }
}

export async function resolveStore(query: StoreLookup): Promise<ResolvedStore | null> {
  if (!query.id && !query.key && !query.slug && !query.host) return null
  const cacheKey = JSON.stringify([query.id || '', query.key || '', query.slug || '', query.host || ''])
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const value = await lookup(getControlPlane(), query)
  cache.set(cacheKey, { value, expiresAt: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS) })
  return value
}

interface RequestHeaders {
  header(name: string): string | undefined
}

export function requestConnectionKey(req: RequestHeaders): string | null {
  return parseConnectionKey(req.header('X-OpenPOS-Connection') || '')
}

export function requestHost(req: RequestHeaders): string | null {
  // The web Worker forwards /api calls through a service binding and passes the
  // browser's host along, so the shared API knows which store page made the call.
  const raw = req.header('X-Forwarded-Host') || req.header('Host') || ''
  return raw.split(',')[0]?.trim().toLowerCase() || null
}

/** Store for an unauthenticated request: connection key, then host, then DEFAULT_STORE. */
export async function resolveRequestStore(req: RequestHeaders): Promise<ResolvedStore | null> {
  const key = requestConnectionKey(req)
  const host = requestHost(req)
  const resolved = key || host ? await resolveStore({ key, host }) : null
  if (resolved) return resolved
  const fallback = process.env.DEFAULT_STORE?.trim()
  return fallback ? resolveStore({ slug: fallback }) : null
}

export function publicStore(store: StoreRecord) {
  return { id: store.id, name: store.name, slug: store.slug }
}
