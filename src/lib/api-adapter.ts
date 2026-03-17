import { isTauri } from './platform'

// JWT stored in localStorage after login
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

/**
 * HTTP adapter that mirrors the db-adapter API but sends requests to /api endpoints.
 * Used only in web mode; Tauri mode uses the original Turso/SQLite adapter.
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isTauri) {
    throw new Error('query() should not be called from api-adapter in Tauri mode')
  }

  const token = getAuthToken()
  if (!token) {
    throw new Error('No auth token available for API call')
  }

  const response = await fetch('/api/query', {
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

  const response = await fetch('/api/execute', {
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
