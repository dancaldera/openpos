import { requestApiJson } from '../lib/api-client'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'

export const CONNECTION_KEY_STORAGE = 'openpos_connection_key'

export interface ConnectionCreateInput {
  storeName: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

export interface ConnectionJoinInput {
  key: string
  seed: string
}

export interface ConnectionResult {
  key: string
  seed?: string
  storeName: string
  published: boolean
}

export function getStoredConnectionKey(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(CONNECTION_KEY_STORAGE) || ''
}

export function storeConnectionKey(key: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONNECTION_KEY_STORAGE, key)
}

export function clearStoredConnectionKey(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(CONNECTION_KEY_STORAGE)
}

export async function createStoreConnection(input: ConnectionCreateInput): Promise<ConnectionResult> {
  if (isDesktop) {
    const result = await requireDesktopApi().connection.create(input)
    storeConnectionKey(result.key)
    return result
  }

  const result = await requestApiJson<ConnectionResult>('/api/connections', {
    method: 'POST',
    body: input,
  })
  storeConnectionKey(result.key)
  return result
}

export async function joinStoreConnection(input: ConnectionJoinInput): Promise<ConnectionResult> {
  if (isDesktop) {
    const result = await requireDesktopApi().connection.join(input)
    storeConnectionKey(result.key)
    return result
  }

  const result = await requestApiJson<ConnectionResult>('/api/connections/join', {
    method: 'POST',
    body: input,
  })
  storeConnectionKey(result.key)
  return result
}

export async function importStoreConnection(input: { url: string; authToken: string }): Promise<ConnectionResult> {
  if (isDesktop) {
    const result = await requireDesktopApi().connection.importRemote(input)
    storeConnectionKey(result.key)
    return result
  }

  const result = await requestApiJson<ConnectionResult>('/api/connections/import', {
    method: 'POST',
    body: input,
  })
  storeConnectionKey(result.key)
  return result
}
