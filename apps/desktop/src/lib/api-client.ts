import { getApiUrl } from './api-config'

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  requireAuth?: boolean
}

export async function requestApiJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, requireAuth = false, ...init } = options
  const requestHeaders = new Headers(headers)

  if (!requestHeaders.has('Content-Type') && body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (requireAuth) {
    const token = getAuthToken()
    if (!token) {
      throw new Error('No auth token available for API call')
    }
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(await getApiUrl(path), {
    ...init,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText || 'Unknown error' }))
    throw new Error(error.error || response.statusText || 'API request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
