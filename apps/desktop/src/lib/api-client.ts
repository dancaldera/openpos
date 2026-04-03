import { getApiUrl } from './api-config'
import { expireSession, isExpiredTokenMessage } from './auth-session'

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  requireAuth?: boolean
}

export async function requestApi(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { body, headers, requireAuth = false, ...init } = options
  const requestHeaders = new Headers(headers)
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  if (!requestHeaders.has('Content-Type') && body !== undefined && !isFormData) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (requireAuth) {
    const token = getAuthToken()
    if (!token) {
      expireSession()
    }
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  return fetch(await getApiUrl(path), {
    ...init,
    headers: requestHeaders,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  })
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null)
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : null
    if (errorMessage) {
      return errorMessage
    }
  }

  const text = await response.text().catch(() => '')
  return text.trim() || response.statusText || 'API request failed'
}

export async function requestApiJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await requestApi(path, options)

  if (!response.ok) {
    const errorMessage = await getApiErrorMessage(response)

    if (options.requireAuth && (response.status === 401 || isExpiredTokenMessage(errorMessage))) {
      expireSession()
    }

    throw new Error(errorMessage)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
