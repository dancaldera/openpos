import { requestApi, requestApiJson } from '../lib/api-client'
import { type DesktopFirstRunStatus, requireDesktopApi } from '../lib/desktop'
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
  status?: DesktopFirstRunStatus
}

export interface AssignedConnection {
  key: string
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

export function clearLocalClientState(): void {
  clearStoredConnectionKey()
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('pos_user')
  localStorage.removeItem('auth_token')
  localStorage.removeItem('desktop_remote_auth_status')
}

export async function fetchAssignedConnection(): Promise<AssignedConnection | null> {
  const response = await requestApi('/api/connections/assigned')
  if (response.status === 404) return null
  if (!response.ok) {
    const text = (await response.text()).trim()
    let message = text
    try {
      const payload = JSON.parse(text) as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error) {
        message = payload.error
      }
    } catch {
      // Keep the raw body.
    }
    throw new Error(message || 'Unable to load the assigned store')
  }
  return (await response.json()) as AssignedConnection
}

export async function bindWebAssignedConnection(): Promise<AssignedConnection | null> {
  const assigned = await fetchAssignedConnection()
  if (assigned) {
    storeConnectionKey(assigned.key)
    return assigned
  }
  clearStoredConnectionKey()
  return null
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

export interface ConnectionImportInput {
  url: string
  authToken: string
  storeName?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}

export interface ConnectionOwnerInput {
  storeName: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

export async function importStoreConnection(input: ConnectionImportInput): Promise<ConnectionResult> {
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

export async function registerStoreConnection(input: {
  storeName?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}): Promise<ConnectionResult> {
  const payload: { key: string; storeName?: string; url?: string; authToken?: string } = isDesktop
    ? await requireDesktopApi().connection.getRegisterPayload()
    : { key: getStoredConnectionKey(), storeName: input.storeName || '' }

  if (!payload.key) {
    throw new Error('Store connection required')
  }

  return requestApiJson<ConnectionResult>('/api/connections/register', {
    method: 'POST',
    body: {
      key: payload.key,
      url: payload.url,
      authToken: payload.authToken,
      storeName: input.storeName || payload.storeName,
      adminName: input.adminName,
      adminEmail: input.adminEmail,
      adminPassword: input.adminPassword,
    },
  })
}

export async function bootstrapStoreOwner(
  input: ConnectionOwnerInput,
): Promise<DesktopFirstRunStatus | ConnectionResult> {
  if (isDesktop) {
    return requireDesktopApi().connection.bootstrapOwner(input)
  }

  const key = getStoredConnectionKey()
  const result = await requestApiJson<ConnectionResult>('/api/connections/owner', {
    method: 'POST',
    body: { key, ...input },
  })
  return result
}
