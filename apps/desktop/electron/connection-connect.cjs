/**
 * Key-only onboarding. The admin app creates the store; this device trades
 * the connection key for the store's sync credentials through the API.
 */

const { parseConnectionKey } = require('@openpos/data')

const CONNECT_TIMEOUT_MS = 15_000

function isSupportedDatabaseUrl(url) {
  return typeof url === 'string' && /^(libsql:\/\/|https:\/\/|http:\/\/|file:)/.test(url)
}

async function connectWithKey({ apiUrl, key, fetchImpl = fetch, timeoutMs = CONNECT_TIMEOUT_MS }) {
  const parsedKey = parseConnectionKey(key || '')
  if (!parsedKey) {
    throw new Error('invalid_connection_key')
  }

  let response
  try {
    response = await fetchImpl(`${apiUrl}/api/connections/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: parsedKey }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new Error(`Cannot reach the API server at ${apiUrl}. Check the API URL and network connection.`)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' && payload.error ? payload.error : `Connection failed (${response.status})`,
    )
  }

  const dataPlane = payload?.dataPlane
  if (!isSupportedDatabaseUrl(dataPlane?.url)) {
    throw new Error('The API returned an invalid store database URL')
  }
  if (!dataPlane.url.startsWith('file:') && !dataPlane.authToken) {
    throw new Error('The API did not return a store database token')
  }

  return {
    key: parseConnectionKey(payload.key) || parsedKey,
    storeName: String(payload.store?.name || 'OpenPOS'),
    dataPlane: {
      url: dataPlane.url,
      ...(dataPlane.authToken ? { authToken: String(dataPlane.authToken) } : {}),
    },
  }
}

module.exports = { connectWithKey }
