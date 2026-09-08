import { getApiBaseUrl, getApiUrl } from './api-config'
import { expireSession, isExpiredTokenMessage } from './auth-session'

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

const DEFAULT_API_TIMEOUT_MS = 15_000

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  requireAuth?: boolean
  timeoutMs?: number
}

export async function requestApi(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { body, headers, requireAuth = false, timeoutMs, signal, ...init } = options
  const requestHeaders = new Headers(headers)
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  if (!requestHeaders.has('Content-Type') && body !== undefined && !isFormData) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (requireAuth) {
    const token = getAuthToken()
    if (!token) {
      const apiBaseUrl = await getApiBaseUrl()
      if (!apiBaseUrl) {
        throw new Error('Remote API is not configured')
      }
      expireSession()
    }
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  if (typeof localStorage !== 'undefined') {
    const connectionKey = localStorage.getItem('openpos_connection_key')
    if (connectionKey) {
      requestHeaders.set('X-OpenPOS-Connection', connectionKey)
    }
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs ?? DEFAULT_API_TIMEOUT_MS)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const apiUrl = await getApiUrl(path)

  try {
    return await fetch(apiUrl, {
      ...init,
      signal: requestSignal,
      headers: requestHeaders,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    })
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    throw new Error(describeNetworkFailure(error, await getApiBaseUrl()), { cause: error })
  }
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

function describeNetworkFailure(error: unknown, apiBaseUrl: string): string {
  const target = apiBaseUrl ? ` at ${apiBaseUrl}` : ''

  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return `The API server${target} did not respond in time. Check your internet connection and the configured API URL.`
  }

  return `Cannot reach the API server${target}. Check your internet connection and the configured API URL.`
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
