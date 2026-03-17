import { getApiUrl } from './api-config'
import { isTauri } from './platform'

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isTauri) {
    throw new Error('query() should not be called from api-adapter in Tauri mode')
  }

  const token = getAuthToken()
  if (!token) {
    throw new Error('No auth token available for API call')
  }

  const response = await fetch(getApiUrl('/api/query'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sql, params }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`API query failed: ${error.error || response.statusText}`)
  }

  const data = await response.json()
  return data.rows as T[]
}

export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  if (isTauri) {
    throw new Error('execute() should not be called from api-adapter in Tauri mode')
  }

  const token = getAuthToken()
  if (!token) {
    throw new Error('No auth token available for API call')
  }

  const response = await fetch(getApiUrl('/api/execute'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sql, params }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`API execute failed: ${error.error || response.statusText}`)
  }

  const data = await response.json()
  return {
    lastInsertId: data.lastInsertId || 0,
    rowsAffected: data.rowsAffected || 0,
  }
}
