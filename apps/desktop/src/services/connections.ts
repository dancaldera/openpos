import { requestApi } from '../lib/api-client'
import { type DesktopFirstRunStatus, requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'

export const CONNECTION_KEY_STORAGE = 'openpos_connection_key'

export interface StoreSummary {
  id: string
  name: string
  slug: string
}

export interface ConnectResult {
  key: string
  storeName: string
  status?: DesktopFirstRunStatus
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

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const text = (await response.text().catch(() => '')).trim()
  try {
    const payload = JSON.parse(text) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error) return payload.error
  } catch {
    // Keep the raw body.
  }
  return text || fallback
}

/**
 * Store the API serves for this client: picked by the page host on the web
 * (demo.pos.softmelody.dev) or by the stored connection key. Null when neither
 * matches a store.
 */
export async function fetchCurrentStore(): Promise<StoreSummary | null> {
  const response = await requestApi('/api/connections/current')
  if (response.status === 401 || response.status === 404) return null
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Unable to load the store'))
  }
  return ((await response.json()) as { store: StoreSummary }).store
}

/** Web startup: find the store for this page, forgetting a key that no longer works. */
export async function resolveWebStore(): Promise<StoreSummary | null> {
  const store = await fetchCurrentStore()
  if (!store && getStoredConnectionKey()) {
    clearStoredConnectionKey()
    return fetchCurrentStore()
  }
  return store
}

/** Connect this client to the store that owns `key` (created in the admin app). */
export async function connectWithKey(input: { key: string; apiUrl?: string }): Promise<ConnectResult> {
  const key = input.key.trim()
  if (isDesktop) {
    const result = await requireDesktopApi().connection.connect({ key, apiUrl: input.apiUrl?.trim() || '' })
    storeConnectionKey(result.key)
    return result
  }

  const previous = getStoredConnectionKey()
  storeConnectionKey(key)
  try {
    const store = await fetchCurrentStore()
    if (!store) throw new Error('connection_not_found')
    return { key, storeName: store.name }
  } catch (error) {
    if (previous) storeConnectionKey(previous)
    else clearStoredConnectionKey()
    throw error
  }
}
